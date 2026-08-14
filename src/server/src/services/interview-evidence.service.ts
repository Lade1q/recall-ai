import prisma from '../config/prisma';
import { decideEvidenceWrite } from '../utils/evidence-write';
import type { EvidenceStatus, RawEvidence } from '../utils/evidence-guard';

/**
 * Writing down what a student demonstrated, one checkpoint at a time (#330, §2.2).
 *
 * The storage half of the Interview v2 grain: the model emits evidence per checkpoint and never a
 * score, so nothing here computes mastery. `masteryScore` becomes a deterministic READ over these
 * rows when a concept closes (#331) — which is why the write-race class fixed by hand in #288
 * disappears structurally rather than by another patch: two fires for the same checkpoint are the
 * same cell, not two racers for one score column.
 *
 * Scope note — this module has NO caller yet, by design. The voice path (`record_evidence` over
 * the WS proxy) and the text path (`grade_answer` → evidence, after #307) are wired later, and
 * the per-turn claim path in `interview.service.ts` keeps running untouched until the cutover at
 * #331 (§7 coexistence). Deleting it now would break the live text path and #305's score, which
 * still read from turns.
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
