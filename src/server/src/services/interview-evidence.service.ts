import prisma from '../config/prisma';
import { decideEvidenceWrite } from '../utils/evidence-write';
import type { EvidenceStatus, RawEvidence } from '../utils/evidence-guard';
import { mapGradeEvidence, tallyUnmapped } from '../utils/grade-evidence';
import type { EvidenceRuler, UnmappedReason } from '../utils/grade-evidence';

/**
 * Writing down what a student demonstrated, one checkpoint at a time (#330, §2.2).
 *
 * The storage half of the Interview v2 grain: the model emits evidence per checkpoint and never a
 * score, so nothing here computes mastery. `masteryScore` becomes a deterministic READ over these
 * rows when a concept closes (#331) — which is why the write-race class fixed by hand in #288
 * disappears structurally rather than by another patch: two fires for the same checkpoint are the
 * same cell, not two racers for one score column.
 *
 * Scope note — the TEXT path is wired as of #346 (`recordTurnEvidence` below, called from
 * `interview.service.ts` once a grade is safely written). The voice path (`record_evidence` over
 * the WS proxy) is still to come. What has NOT changed is the grain: the per-turn claim path keeps
 * computing the score the student sees, and `finalizeConceptCoverage` still has no caller. #346 is
 * purely ADDITIVE — evidence is recorded alongside, and the cutover is its own issue, because the
 * result screen (#307) renders the 3-turn weighted average as prose and a coverage score is not
 * that number.
 */

/**
 * What one `upsertEvidence` call did.
 *
 * Returned rather than swallowed so a caller — and the audit at #331 — can count the two ways a
 * fire fails to become a row: `dropped` is the model leaving its declared enum (schema leakage,
 * measured live at spike S0), `downgraded` is an INV-2 save (too uncertain to punish). Both leave
 * the checkpoint with no row, which is exactly how `not_discussed` is represented.
 */
export type EvidenceUpsertOutcome =
  | { kind: 'written'; status: EvidenceStatus }
  | { kind: 'skipped'; reason: 'downgraded' | 'dropped' };

/**
 * Records the examiner's conclusion about ONE checkpoint in ONE session, idempotently.
 *
 * The guard runs FIRST (`decideEvidenceWrite`): an unusable fire returns without a query, so a
 * `"Running"` or an "I don't remember" never reaches the table at all — the absence of a row is
 * the representation of `not_discussed`, so there is nothing to write and nothing to clean up
 * later.
 *
 * A kept fire upserts on `(sessionId, conceptId, checkpointId)`. That unique key is what makes a
 * re-emit safe: a reconnect or a retry rewrites its own cell instead of appending a second
 * opinion, so a flaky connection cannot inflate a concept's coverage. Every column of the row
 * comes from the fire that last wrote it, `checkpointText` included — the row states the current
 * conclusion and the ruler it was measured against together, so the two can never describe
 * different moments.
 *
 * `checkpointText` is stored VERBATIM as the caller supplied it — read it from
 * `listConceptCheckpoints`, not from the model. It is not trimmed or truncated here on purpose,
 * and NOT because anything downstream compares it byte for byte: the row is a historical record
 * of what the ruler said at the moment of measurement, and normalising here would stand up a
 * SECOND normalisation pipeline that can drift away from `normalizeCheckpointText`. The source
 * has already collapsed its whitespace before storage, so there is nothing left here to collapse,
 * and the column is `VarChar(300)` like its source — the only way to overflow it is to pass text
 * that never came from a checkpoint.
 *
 * A re-anchor built on this snapshot later (deliberately left open, NOT built here) must match on
 * `checkpointKey(checkpointText)` — normalised and CASE-FOLDED — never on raw bytes: checkpoint
 * identity is `checkpointKey`, and `planCheckpointMerge` writes fresh text under the existing id,
 * so even a LIVE checkpoint changes bytes when the model re-cases it. Casing is the only drift
 * vector, and it is exactly the one a byte comparison would miss.
 *
 * @param checkpointId the id of an EXISTING `ConceptCheckpoint` (INV-1 — the examiner measures
 *   against the committed ruler and may not invent a checkpoint mid-session). Not a foreign key:
 *   see the schema note on why a re-analysis must not be able to delete a student's answers.
 * @param turnRef the interview turn this came from on the text path; omitted on voice, which has
 *   no discrete turn.
 */
export async function upsertEvidence(
  sessionId: string,
  conceptId: string,
  checkpointId: string,
  checkpointText: string,
  raw: RawEvidence,
  turnRef?: string | null
): Promise<EvidenceUpsertOutcome> {
  const decision = decideEvidenceWrite(raw);

  if (decision.kind === 'skip') {
    return { kind: 'skipped', reason: decision.reason };
  }

  const claim = {
    checkpointText,
    status: decision.status,
    quote: decision.quote,
    turnRef: turnRef ?? null,
  };

  await prisma.interviewEvidence.upsert({
    where: { sessionId_conceptId_checkpointId: { sessionId, conceptId, checkpointId } },
    create: { sessionId, conceptId, checkpointId, ...claim },
    update: claim,
  });

  return { kind: 'written', status: decision.status };
}

/** Everything one turn's evidence did, so a run can be read off the log instead of guessed at. */
export interface TurnEvidenceTally {
  written: number;
  /** `sanitizeEvidence` rejections (#326): enum leakage and INV-2 saves, kept apart. */
  downgraded: number;
  dropped: number;
  /** Rejected before the guard ever saw them — see `UnmappedReason`. */
  unmapped: Record<UnmappedReason, number>;
  /**
   * The row was writable but the write itself failed (the database, not the model). Counted
   * separately because it is not a statement about the answer at all: lumping it in with the model
   * failures above would make an outage look like a prompt problem.
   */
  writeFailed: number;
}

export interface RecordTurnEvidenceParams {
  sessionId: string;
  conceptId: string;
  /** The turn this came from — `pending.id`, the same turn whose grade was just committed. */
  turnRef: string;
  /** The checkpoint array that was serialised into THIS request's prompt. Never a re-read. */
  ruler: readonly EvidenceRuler[];
  /** What the student actually typed, for the §④ grounding check. */
  answerText: string;
  /** `grade_answer`'s `evidence` field, exactly as it arrived. */
  raw: unknown;
}

/**
 * Records one turn's evidence: map indices onto the ruler, then push each surviving entry through
 * the same guarded write every other path uses (#346).
 *
 * ⚠️ CALL ORDER IS THE POINT. This must run only AFTER the claim-bound verdict write reported
 * `count > 0` in `interview.service.ts`. A request that LOSES its claim (Gemini outran
 * `ANSWER_CLAIM_STALE_MS` and a newer request took the turn) is holding a perfectly valid grade
 * whose score is thrown away — and because the evidence write is an upsert on
 * `(sessionId, conceptId, checkpointId)`, running it there would let the LOSER overwrite the
 * winner's evidence. That is bug #288 reappearing at a different table, so the order is not a
 * preference.
 *
 * Returns rather than throws. Every await inside is guarded per item, so a failure costs one row,
 * never the grade — evidence is additive and must not be able to fail an answer that was graded
 * correctly. There is deliberately no blanket try/catch around the whole thing: with the individual
 * awaits covered, anything still escaping is a genuine bug worth seeing rather than swallowing.
 */
export async function recordTurnEvidence(
  params: RecordTurnEvidenceParams
): Promise<TurnEvidenceTally> {
  const { sessionId, conceptId, turnRef, ruler, answerText, raw } = params;

  const mapping = mapGradeEvidence(raw, ruler, answerText);
  const tally: TurnEvidenceTally = {
    written: 0,
    downgraded: 0,
    dropped: 0,
    unmapped: tallyUnmapped(mapping.unmapped),
    writeFailed: 0,
  };

  // Counting is not enough: a backstop that has been muzzled looks exactly like a backstop with
  // nothing to do. Each rejection is logged with its own reason, because the first live run is what
  // tells us whether the model quotes verbatim or paraphrases — and only `quote_not_found` answers
  // that question.
  for (const rejected of mapping.unmapped) {
    console.warn(`[evidence] turn ${turnRef}: ${rejected.reason} — ${rejected.detail}`);
  }

  for (const entry of mapping.mapped) {
    try {
      const outcome = await upsertEvidence(
        sessionId,
        conceptId,
        entry.checkpointId,
        entry.checkpointText,
        { status: entry.status, quote: entry.quote },
        turnRef
      );
      if (outcome.kind === 'written') {
        tally.written += 1;
      } else {
        tally[outcome.reason] += 1;
      }
    } catch (error) {
      tally.writeFailed += 1;
      const detail = error instanceof Error ? error.message : 'unknown error';
      console.error(
        `[evidence] turn ${turnRef}: write failed for checkpoint ${entry.checkpointId} — ${detail}`
      );
    }
  }

  // The SUMMARY line. Per-entry rejections above are logged individually and unconditionally, so
  // nothing here decides whether a deviation is visible — that is already settled. What this line
  // adds is the one thing per-entry logs cannot express: the difference between "the backstop had
  // nothing to reject" and "the backstop never ran". A count of zero is only meaningful if it is
  // printed.
  //
  // So it prints whenever there was something to measure, which is either half of:
  //   - a ruler existed, so evidence WAS asked for — the ordinary case; or
  //   - the model sent entries anyway. A concept with no checkpoints is a legal committed state
  //     (#333) and the prompt asks for an empty list in that case; a model that answers regardless
  //     puts every entry in `bad_index`, and that turn deserves its total.
  //
  // Gating on `!mapping.absent` for the second half was measured and rejected: it also fires on a
  // `C = 0` concept whose model COMPLIED, so every turn of every checkpoint-less concept would emit
  // an all-zero line. That is new noise on the ordinary path bought for a measurement in a rare
  // one. "Entries to count" buys the same case without it.
  //
  // ⚠️ `field=absent` LOOKS LIKE DEAD CODE. It is not, and the reason it currently cannot fire is
  // itself load-bearing, so read all three of these before deleting it:
  //   1. Today `absent` is unreachable on this path because `evidence` is a REQUIRED property of
  //      the JSON Schema derived from `gradeAnswerAskSchema` — structured output is why every live
  //      grading measured at #346 carried the field. It is not luck and not the prompt.
  //   2. That requirement is itself netted: `ai-interview.schema.test.ts`'s "asks for evidence on
  //      every grade rather than leaving the field optional" fails the moment someone marks it
  //      `.optional()`. So the guarantee cannot evaporate quietly — it can only be removed on
  //      purpose, with a red test.
  //   3. The path that DOES reach it is a caller with no structured output: the voice side's
  //      `record_evidence` over the WS proxy (lane D2), which reuses this function. This gate
  //      exists for that day, and it is the reason a missing field will be visible then instead of
  //      silent.
  // Nothing tests that this branch continues to EXIST; only this comment does.
  //
  // `warn` rather than `info` because the lint rule allows only `warn`/`error` — the level is the
  // codebase's floor, not a claim that this is a problem.
  const askedForEvidence = ruler.length > 0;
  const modelSentEntries = mapping.mapped.length + mapping.unmapped.length > 0;

  if (askedForEvidence || modelSentEntries) {
    const { bad_index, parse_failed, quote_not_found, self_contradicted, over_limit } =
      tally.unmapped;
    // `written` counts ENTRIES accepted, not rows created: two entries naming the same checkpoint
    // are two writes to one cell, so `written=2` can mean one row. Worth spelling out while this
    // line is the measurement.
    console.warn(
      `[evidence] turn ${turnRef}: ${mapping.absent ? 'field=absent ' : ''}` +
        `written=${tally.written} downgraded=${tally.downgraded} ` +
        `dropped=${tally.dropped} bad_index=${bad_index} parse_failed=${parse_failed} ` +
        `quote_not_found=${quote_not_found} self_contradicted=${self_contradicted} ` +
        `over_limit=${over_limit} write_failed=${tally.writeFailed}`
    );
  }

  return tally;
}
