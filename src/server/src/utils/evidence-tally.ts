import type { EvidenceStatus } from './evidence-guard';

/**
 * Turning the evidence stored for ONE concept into the three counts the coverage formula takes
 * (#331, §2.1/§2.3): how many checkpoints the concept committed, how many the student settled,
 * and how they settled.
 *
 * The read half of the Interview v2 grain. `evidence-write.ts` decides what earns a row; this
 * decides what those rows add up to at scoring time. `not_discussed` has no column and never
 * did — it is the remainder here, which is why an unresolved checkpoint costs nothing to
 * represent and nothing to clean up (INV-2).
 *
 * Pure — no Prisma, no Gemini, no clock — so the arithmetic under a mastery score stays provable
 * from fixtures with `DATABASE_URL` and `GEMINI_API_KEY` switched off (SDP risk R05). Reading the
 * rows is `concept-coverage.service.ts`'s job.
 */

/** One stored `InterviewEvidence` row, narrowed to what the tally needs. */
export interface StoredEvidence {
  checkpointId: string;
  status: EvidenceStatus;
}

export interface CoverageTally {
  /** `C` — how many checkpoints the concept commits right now (`resolved` can never exceed it). */
  committed: number;
  evCovered: number;
  evContradicted: number;
  /** `evCovered + evContradicted` — checkpoints the student settled, right or wrong. */
  resolved: number;
  /** `committed − resolved` — checkpoints with no evidence, which never count against anyone. */
  notDiscussed: number;
  /**
   * Checkpoint ids the evidence pointed at that the concept does not commit any more. Reported
   * rather than swallowed: the join drops them silently otherwise, and this is the only place
   * that can see it happen.
   */
  orphanedCheckpointIds: string[];
}

/**
 * Counts one concept's evidence AGAINST THE RULER IT COMMITS NOW — an inner join, not a blind
 * count of rows.
 *
 * Evidence whose `checkpointId` is not in `committedCheckpointIds` is not counted, in either
 * direction: it neither earns coverage nor is charged as a contradiction. Three ways a row gets
 * there, all real — `checkpointId` is deliberately NOT a foreign key (see the schema note), so
 * nothing in the database prevents any of them:
 *   - a re-analysis deleted the checkpoint mid-plan, leaving the answer behind on purpose;
 *   - a caller wrote evidence against a checkpoint of a DIFFERENT concept (the `conceptId` in the
 *     unique key makes that a second row rather than a collision);
 *   - a caller invented an id outright — INV-1 is a contract in a docstring, not a constraint.
 * Counting any of them would put a stale or fabricated numerator under a mastery score, which is
 * the one thing INV-1 exists to prevent.
 *
 * Both counts come from checkpoints in the committed set, each id counted once, so
 * `resolved <= committed` holds BY CONSTRUCTION. That is what turns the `resolved > committed`
 * guard in `coverageMasteryScore` into a backstop for other callers rather than a live check —
 * and it is why the orphan list, not that guard, is what says evidence fell off the ruler.
 *
 * A duplicate row for one checkpoint cannot come out of the table (the unique key forbids it) and
 * cannot inflate anything here either: the last one read wins its cell. A status outside the enum
 * cannot come out of the column, and if one ever did it would land as `not_discussed` — the
 * direction that declines to score, never one that manufactures a score.
 */
export function tallyConceptEvidence(
  evidence: readonly StoredEvidence[],
  committedCheckpointIds: readonly string[]
): CoverageTally {
  const ruler = new Set(committedCheckpointIds);
  const statusByCheckpoint = new Map<string, EvidenceStatus>();
  const orphanedCheckpointIds: string[] = [];

  for (const row of evidence) {
    if (!ruler.has(row.checkpointId)) {
      orphanedCheckpointIds.push(row.checkpointId);
      continue;
    }
    statusByCheckpoint.set(row.checkpointId, row.status);
  }

  let evCovered = 0;
  let evContradicted = 0;
  for (const status of statusByCheckpoint.values()) {
    if (status === 'covered') {
      evCovered += 1;
    } else if (status === 'contradicted') {
      evContradicted += 1;
    }
  }

  // `ruler.size`, not the array length: the count and the join target are then the same object,
  // so a repeated id could not raise `C` without also being answerable.
  const committed = ruler.size;
  const resolved = evCovered + evContradicted;

  return {
    committed,
    evCovered,
    evContradicted,
    resolved,
    notDiscussed: committed - resolved,
    orphanedCheckpointIds,
  };
}
