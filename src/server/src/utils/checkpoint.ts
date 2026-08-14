/**
 * The checkpoints of one concept: what a student must demonstrate to be counted as
 * understanding it (Interview v2, #329).
 *
 * INV-1 — the list is committed at ANALYSIS time and immutable while grading. Nothing here runs
 * during an interview: the model conducting a session may only emit evidence against a
 * `ConceptCheckpoint.id` that already exists, never invent one mid-session. That is C4 at the
 * micro scale — the deterministic side owns the ruler it measures with.
 *
 * Two consequences shape this file. Checkpoint ids must stay STABLE across re-analysis, because
 * interview evidence points at them, so a re-extraction is merged onto the stored rows by text
 * rather than replayed onto an empty concept — the same reasoning (and the same shape) as
 * `concept-merge.ts`. And a concept may legitimately end up with NO checkpoints: `C = 0` is a
 * valid outcome, not an error — such a concept is simply not voice-assessable and is routed to
 * the text path by the §2.4 guard, elsewhere.
 *
 * There is deliberately no difficulty or weight per checkpoint: a harder point is written as MORE
 * checkpoints, which keeps scoring at one constant in one place (§2.3).
 *
 * Pure functions — no Prisma, no Gemini, no clock — so the ruler stays provable from fixtures
 * with the database and the API key switched off (SDP risk R05).
 */

/**
 * Hard ceiling on how many checkpoints one concept can commit.
 *
 * Not a judgement about how many a concept *should* have — the prompt asks for a handful and
 * asks for more on a harder concept — but a backstop on `C`, the denominator of
 * `coverageMasteryScore`. An extraction that returns forty checkpoints for one concept would put
 * full coverage out of reach for a whole session, which reads as "never assessed" for material
 * the student may know perfectly well.
 */
export const MAX_CHECKPOINTS_PER_CONCEPT = 12;

/**
 * The stored spelling of a checkpoint: trimmed, with internal runs of whitespace (including the
 * newlines a model likes to wrap on) collapsed to single spaces, so the same sentence is not two
 * different checkpoints depending on how it was formatted.
 */
export function normalizeCheckpointText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * The identity two checkpoints are considered "the same" under, and therefore what keeps an id
 * stable across a re-analysis. Case-folded on top of the whitespace normalisation for the same
 * reason `normalizeConceptKey` is: the model is not stable about capitalisation between runs, and
 * a re-cased checkpoint must not fork into a second row that orphans the evidence already
 * recorded against the first.
 */
export function checkpointKey(text: string): string {
  return normalizeCheckpointText(text).toLocaleLowerCase();
}

/**
 * The checkpoint list of one concept as it will be stored: normalised, empties dropped,
 * duplicates collapsed, capped at `MAX_CHECKPOINTS_PER_CONCEPT`, order preserved.
 *
 * Empties are dropped rather than rejected because that is how a checkpoint the AI schema could
 * not accept arrives here (an over-long or non-string entry is caught to `''` by
 * `conceptExtractSchema`) — one bad entry costs that entry, not the concept's whole list.
 * Duplicates are collapsed because two spellings of one checkpoint would inflate `C`, making full
 * coverage unreachable while the student has in fact answered everything.
 */
export function normalizeCheckpoints(raw: readonly string[]): string[] {
  const texts: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (texts.length === MAX_CHECKPOINTS_PER_CONCEPT) break;
    const text = normalizeCheckpointText(entry);
    if (!text) continue;
    const key = checkpointKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    texts.push(text);
  }

  return texts;
}

/**
 * What a concept's extracted `checkpoints` field actually told us.
 *
 * `committed` carries an answer to act on — INCLUDING an empty one, which legitimately clears a
 * concept's ruler (`C = 0`). `degraded` means the model produced no readable answer, which is not
 * the same thing and must not be acted on.
 */
export type CheckpointCommitment =
  { status: 'committed'; texts: string[] } | { status: 'degraded' };

/**
 * Classifies one concept's raw `checkpoints` field, keeping "the model said none" apart from
 * "the model said nothing usable".
 *
 * The distinction exists because the write path is DESTRUCTIVE: an empty answer deletes every
 * stored checkpoint of that concept (and, once #330 lands, the evidence pointing at them). A
 * deletion that large must rest on a positive signal, never on the absence of one — otherwise a
 * single malformed re-analysis silently drops a concept out of voice assessment, taking the
 * student's answers with it. Spike S0 established that the model's output cannot be trusted to
 * satisfy a declared constraint; that same finding forbids reading its failures as statements.
 *
 * Two shapes are degraded, and the second is easy to miss:
 *   - `null` — the field was absent, null, or not an array (`conceptExtractSchema` caught it).
 *   - a NON-EMPTY array in which every entry was unusable, so normalisation empties it. Entry
 *     failures leave `''` placeholders rather than removing elements, so the raw length is what
 *     separates "the model listed four checkpoints, all malformed" from "the model listed none".
 */
export function readExtractedCheckpoints(raw: readonly string[] | null): CheckpointCommitment {
  if (raw === null) {
    return { status: 'degraded' };
  }
  const texts = normalizeCheckpoints(raw);
  if (texts.length === 0 && raw.length > 0) {
    return { status: 'degraded' };
  }
  return { status: 'committed', texts };
}

/** The columns of an already-stored checkpoint this merge needs to make its decision. */
export interface ExistingCheckpoint {
  id: string;
  text: string;
}

/** A stored row the new extraction still contains: same id, refreshed spelling and position. */
export interface KeptCheckpoint {
  id: string;
  text: string;
  orderIndex: number;
}

/** A checkpoint with no counterpart in storage: inserted fresh, so it gets a new id. */
export interface CreatedCheckpoint {
  text: string;
  orderIndex: number;
}

export interface CheckpointMergePlan {
  toCreate: CreatedCheckpoint[];
  toKeep: KeptCheckpoint[];
  /** Ids stored rows the new extraction no longer contains. Deleted — see the note below. */
  toDelete: string[];
}

/**
 * Works out what to insert, update and delete so one concept's stored checkpoints match a fresh
 * extraction, keeping the id of every checkpoint that survives.
 *
 * Degenerates cleanly for a concept that has none yet: everything lands in `toCreate` and nothing
 * is deleted, which is exactly first-analysis behaviour — so the caller runs one path for both.
 *
 * Dropped checkpoints are DELETED, not tombstoned the way `planConceptMerge` deprecates a dropped
 * concept, and the two differ on purpose. A concept row carries the student's own history —
 * mastery score, interview turns, review-queue rows — which is why it survives its own absence
 * from a re-extraction. A checkpoint is a measuring mark taken from the document: once the
 * re-analysed document no longer supports it, keeping it would leave the examiner probing
 * material that is no longer there (a C5 problem) and would inflate `C` against coverage the
 * student can no longer reach. An empty extraction therefore clears the list — `C = 0`, the
 * concept falls back to the text path, which is a defined state rather than a failure.
 *
 * Because clearing is destructive, a caller may only reach it with an answer the model actually
 * gave: classify the field with `readExtractedCheckpoints` first and skip the concept on
 * `degraded`. This function cannot make that call itself — by the time a list is `[]` it no
 * longer remembers whether it was empty or emptied.
 */
export function planCheckpointMerge(
  existing: readonly ExistingCheckpoint[],
  extracted: readonly string[]
): CheckpointMergePlan {
  // First occurrence wins, matching how the extraction itself is de-duplicated. Rows sharing a
  // key can only come from data written before this normalisation existed; the losers fall
  // through to `toDelete` below, so the duplicate is cleaned up on the next analysis.
  const existingByKey = new Map<string, ExistingCheckpoint>();
  for (const checkpoint of existing) {
    const key = checkpointKey(checkpoint.text);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, checkpoint);
    }
  }

  const toCreate: CreatedCheckpoint[] = [];
  const toKeep: KeptCheckpoint[] = [];
  const matchedIds = new Set<string>();

  normalizeCheckpoints(extracted).forEach((text, orderIndex) => {
    const match = existingByKey.get(checkpointKey(text));
    if (match) {
      toKeep.push({ id: match.id, text, orderIndex });
      matchedIds.add(match.id);
    } else {
      toCreate.push({ text, orderIndex });
    }
  });

  const toDelete = existing.filter((c) => !matchedIds.has(c.id)).map((c) => c.id);

  return { toCreate, toKeep, toDelete };
}
