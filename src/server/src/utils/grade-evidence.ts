import { isEvidenceStatus, isQuoteGrounded, normalizeStatus } from './evidence-guard';
import { MAX_CHECKPOINTS_PER_CONCEPT } from './checkpoint';

/**
 * Turning what `grade_answer` said about the checkpoints into rows we are allowed to write
 * (#346, §③/§④) — the first production caller of the ② chain.
 *
 * The whole file is one rule: NOTHING the model emits identifies a checkpoint. The model returns a
 * 1-based INDEX; the id and the ruler snapshot come from the checkpoint array this same request
 * already read and serialised into the prompt.
 *
 * ⚠️⚠️ The array passed in MUST be the array that went into the prompt, not a re-read of the same
 * concept. The index means "the n-th line the model was shown" and nothing else, so a second read
 * that comes back in a different order maps EVERY row to the wrong checkpoint while every row still
 * looks perfectly valid — a silent failure no counter here can see. Two ways the order can change
 * without anyone touching this code: `listConceptCheckpoints` orders by `orderIndex` alone, which
 * is NOT unique, so ties are unordered between reads; and `planCheckpointMerge` (#329) renumbers
 * live checkpoints, with no guard stopping a re-analysis mid-session (`reanalyzePlan` only refuses
 * a plan that is not `active` — and a plan being interviewed is exactly `active`). Resolving from
 * the serialised array removes the second read, so there is no second order to disagree with.
 * (If a future caller genuinely has to re-read and map by position, THAT is when
 * `orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]` becomes mandatory: an `ORDER BY` on a non-unique
 * column is not a total order. It is not needed here, so it is not done here.)
 * A checkpoint DELETED by a mid-session re-analysis needs no guard either: #331 scores through an
 * INNER JOIN against the current checkpoint set, so an orphaned row never reaches a denominator,
 * and that join already warns when it drops rows.
 *
 * Pure — no Prisma, no Gemini, no clock — so the mapping stays provable from fixtures with the
 * database and the API key switched off (SDP risk R05). `interview-evidence.service.ts` writes.
 */

/** The columns of a committed checkpoint this mapping needs. Same shape as `ConceptCheckpointRow`. */
export interface EvidenceRuler {
  id: string;
  text: string;
}

/**
 * Why an entry the model emitted never became a candidate row. Kept apart rather than summed
 * because the first live run is the measurement that answers a question we are currently guessing
 * at — whether the model paraphrases instead of quoting. A single `unmapped` total could not tell
 * "the model is trimming quotes" from "the model is miscounting", and those need opposite fixes.
 */
export type UnmappedReason =
  'bad_index' | 'parse_failed' | 'quote_not_found' | 'self_contradicted' | 'over_limit';

/**
 * Most entries one grading may be examined for.
 *
 * The ask schema already declares `maxItems: MAX_CHECKPOINTS_PER_CONCEPT`, but nothing enforced it
 * on the way back in, and the response schema deliberately accepts the field unvalidated. The
 * number of ROWS was never at risk — the unique key collapses repeats into one cell per
 * checkpoint — but the number of database round-trips was: N entries meant N sequential upserts.
 * Clamped at the same bound the model was asked for, so accepting leniently does not also mean
 * accepting unboundedly.
 */
export const MAX_EVIDENCE_ENTRIES = MAX_CHECKPOINTS_PER_CONCEPT;

/** One entry that survived mapping. `status` is still RAW — see `mapGradeEvidence`. */
export interface MappedEvidence {
  checkpointId: string;
  checkpointText: string;
  status: string;
  quote: string;
}

/** One entry that did not, with enough detail to log something a human can act on. */
export interface UnmappedEvidence {
  reason: UnmappedReason;
  detail: string;
}

export interface GradeEvidenceMapping {
  mapped: MappedEvidence[];
  unmapped: UnmappedEvidence[];
  /**
   * Whether the model returned no `evidence` field at all, as opposed to an empty list. Kept out
   * of the rejection counters because the two are different statements — "nothing to report" vs
   * "the field went missing" — but it IS a deviation: `evidence` is required by the JSON schema.
   * So the caller reports it on the per-turn line rather than passing over it in silence; a
   * deviation that prints nothing is the one you never find out about.
   */
  absent: boolean;
}

/** Counts by reason, for the one-line-per-turn log. Every reason is present, `0` included. */
export function tallyUnmapped(
  unmapped: readonly UnmappedEvidence[]
): Record<UnmappedReason, number> {
  const tally: Record<UnmappedReason, number> = {
    bad_index: 0,
    parse_failed: 0,
    quote_not_found: 0,
    self_contradicted: 0,
    over_limit: 0,
  };
  for (const entry of unmapped) {
    tally[entry.reason] += 1;
  }
  return tally;
}

/** Keeps a logged quote readable without spilling a whole answer into the log. */
function preview(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= 80 ? collapsed : `${collapsed.slice(0, 80)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Maps one `grade_answer` response's `evidence` field onto the committed ruler.
 *
 * Total: it never throws and never rejects the batch as a whole. `raw` is typed `unknown` because
 * that is genuinely what arrives — `gradeAnswerResponseSchema` accepts the field unvalidated so a
 * malformed entry cannot take the student's grade down with it (see the note there). Every entry is
 * judged on its own; a bad one costs that entry.
 *
 * 🚫 What this must NOT become: a `.catch(() => [])` around the batch. That is the trap #329/PR #333
 * already sprang — it silently rewrites "the model returned garbage" into "the model reported
 * nothing", and the two are indistinguishable afterwards. Rejections are RETURNED, so the caller
 * can count and log them.
 *
 * Checks run in a fixed order, and the order is part of the contract because an entry can fail more
 * than one of them and each failure is counted once:
 *   1. shape (`parse_failed`) — the entry is not an object, or `checkpoint`/`status`/`quote` are
 *      not of the right primitive type. An empty or whitespace-only `quote` lands here too: it is a
 *      missing quote, and letting it through would be worse than useless because `''` is a
 *      substring of every answer and would sail past the grounding check below.
 *   2. index (`bad_index`) — not an integer, or outside `1..ruler.length`. An empty ruler puts
 *      every entry here, which is the correct reading: a concept with no checkpoints (`C = 0`) has
 *      nothing to record evidence against.
 *   3. grounding (`quote_not_found`) — the quote is not verbatim in the answer (§④).
 *
 * `status` is deliberately passed through RAW, unjudged. Deciding whether a status is inside the
 * enum stays `sanitizeEvidence`'s job (#326), so its `dropped` counter goes on measuring schema
 * leakage from the model; adjudicating it here would quietly empty that measurement into this one.
 *
 * Duplicate indices with the SAME status are not de-duplicated. Two such entries are two writes to
 * ONE cell — `upsertEvidence`'s `(sessionId, conceptId, checkpointId)` key is what makes a re-emit
 * rewrite its own cell instead of appending a second opinion (#330) — so the result is the same row
 * either way. Note that `written` therefore counts ENTRIES ACCEPTED, not rows created.
 *
 * Duplicate indices with OPPOSITE statuses are a different thing entirely and are dropped: see
 * `dropSelfContradictions`. That case was observed live, which is why it is handled here rather
 * than left to array order.
 */
export function mapGradeEvidence(
  raw: unknown,
  ruler: readonly EvidenceRuler[],
  answerText: string
): GradeEvidenceMapping {
  if (raw === undefined || raw === null) {
    return { mapped: [], unmapped: [], absent: true };
  }

  const mapped: MappedEvidence[] = [];
  const unmapped: UnmappedEvidence[] = [];

  if (!Array.isArray(raw)) {
    // The field arrived as something other than a list. Counted as a shape failure like a bad
    // entry — one deviation, one count — rather than silently read as "no evidence".
    unmapped.push({
      reason: 'parse_failed',
      detail: `evidence is ${typeof raw}, expected an array`,
    });
    return { mapped, unmapped, absent: false };
  }

  if (raw.length > MAX_EVIDENCE_ENTRIES) {
    // Counted, not silently sliced. A cut that leaves no trace is the same failure as a backstop
    // with no counter: nobody can tell "the model stayed inside the bound" from "we stopped
    // looking". Its own reason, because the surplus entries were never examined — calling them
    // `parse_failed` would claim we found something wrong with them.
    unmapped.push({
      reason: 'over_limit',
      detail: `${raw.length} entries, examined the first ${MAX_EVIDENCE_ENTRIES}`,
    });
  }

  raw.slice(0, MAX_EVIDENCE_ENTRIES).forEach((entry, position) => {
    const at = `entry #${position + 1}`;

    if (!isRecord(entry)) {
      unmapped.push({ reason: 'parse_failed', detail: `${at}: not an object` });
      return;
    }

    const { checkpoint, status, quote } = entry;

    if (typeof status !== 'string') {
      unmapped.push({ reason: 'parse_failed', detail: `${at}: status is ${typeof status}` });
      return;
    }
    if (typeof quote !== 'string' || quote.trim() === '') {
      unmapped.push({ reason: 'parse_failed', detail: `${at}: missing quote` });
      return;
    }
    if (typeof checkpoint !== 'number') {
      unmapped.push({
        reason: 'parse_failed',
        detail: `${at}: checkpoint is ${typeof checkpoint}`,
      });
      return;
    }

    // `1.5`, `NaN` and `Infinity` are `bad_index`, not `parse_failed`. The field arrived as the
    // right TYPE — what is wrong is the counting, and that is the distinction the two reasons
    // exist to draw: `parse_failed` reads as "the entry was the wrong shape", `bad_index` reads as
    // "the model pointed at a checkpoint that is not there". Only the second is actionable.
    if (!Number.isInteger(checkpoint) || checkpoint < 1 || checkpoint > ruler.length) {
      unmapped.push({
        reason: 'bad_index',
        detail: `${at}: checkpoint ${checkpoint} is not an index in 1..${ruler.length}`,
      });
      return;
    }

    if (!isQuoteGrounded(quote, answerText)) {
      unmapped.push({
        reason: 'quote_not_found',
        detail: `${at}: quote not verbatim in the answer — "${preview(quote)}"`,
      });
      return;
    }

    // Safe by the bounds check above; the assertion is only here because the index signature is
    // `noUncheckedIndexedAccess`, not because the element can be missing.
    const target = ruler[checkpoint - 1] as EvidenceRuler;
    mapped.push({
      checkpointId: target.id,
      checkpointText: target.text,
      status,
      quote,
    });
  });

  return { mapped: dropSelfContradictions(mapped, unmapped), unmapped, absent: false };
}

/**
 * Removes every entry for a checkpoint the model gave two OPPOSITE verdicts for in one response,
 * and counts it.
 *
 * OBSERVED, not hypothetical: a live grading emitted `covered` and then `contradicted` for the same
 * checkpoint inside a single response — the model contradicting itself about one sentence, not
 * re-emitting the same conclusion.
 *
 * Letting last-write-wins settle it was the previous behaviour and it is wrong here, for a reason
 * that has nothing to do with tidiness: the surviving verdict would be decided by ARRAY ORDER. In
 * the observed case that order happened to charge the student a misconception on a checkpoint the
 * same response also called covered. INV-2 forbids exactly that — punishing on evidence that is not
 * confirmed — and self-contradiction is the clearest possible case of unconfirmed. Dropping both
 * pulls the checkpoint out of numerator and denominator alike, so the concept drifts toward "not
 * assessed yet" and back into the queue, which is the direction every other guard here falls.
 *
 * Only entries whose statuses are BOTH inside the enum count as a contradiction, and only those
 * entries are removed. A `covered` alongside a `"Running"` is not the model disagreeing with
 * itself, it is one good entry and one piece of garbage — and garbage is `sanitizeEvidence`'s to
 * drop, so its `dropped` counter goes on measuring schema leakage instead of being quietly
 * absorbed here.
 *
 * That holds for the three-entry case too, which is where the first version of this got it wrong:
 * `covered` + `contradicted` + `"Running"` on ONE checkpoint is a contradiction AND a leak, and
 * removing the whole checkpoint took the leak with it — reporting `self_contradicted=1 dropped=0`
 * for the response where the model failed in two ways at once.
 *
 * A repeat with the SAME verdict stays untouched: that is a re-emit, and the unique key already
 * makes it one cell (#330).
 */
function dropSelfContradictions(
  mapped: readonly MappedEvidence[],
  unmapped: UnmappedEvidence[]
): MappedEvidence[] {
  const statusesByCheckpoint = new Map<string, Set<string>>();

  for (const entry of mapped) {
    const status = normalizeStatus(entry.status);
    if (!isEvidenceStatus(status)) continue;
    const seen = statusesByCheckpoint.get(entry.checkpointId) ?? new Set<string>();
    seen.add(status);
    statusesByCheckpoint.set(entry.checkpointId, seen);
  }

  const contradicted = new Set(
    [...statusesByCheckpoint.entries()]
      .filter(([, statuses]) => statuses.size > 1)
      .map(([checkpointId]) => checkpointId)
  );

  if (contradicted.size === 0) return [...mapped];

  for (const checkpointId of contradicted) {
    unmapped.push({
      reason: 'self_contradicted',
      detail: `checkpoint ${checkpointId} got both covered and contradicted in one response`,
    });
  }

  // Drop only the entries that ARE the contradiction. Filtering the whole checkpoint would sweep
  // an out-of-enum entry for that same checkpoint out with them, and that entry is not part of the
  // disagreement — it is schema leakage, which `sanitizeEvidence` must still see so its `dropped`
  // counter keeps measuring leakage. Losing that is worst exactly when it matters most: a response
  // that both contradicts itself AND leaves the enum is the one where the model is failing hardest,
  // and it would be the one where `dropped` reads zero.
  return mapped.filter(
    (entry) =>
      !contradicted.has(entry.checkpointId) || !isEvidenceStatus(normalizeStatus(entry.status))
  );
}
