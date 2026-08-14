import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

/**
 * Reading back the checkpoints a concept committed at analysis time (#329).
 *
 * Writing them is `analysis.service.ts`'s job, inside the extraction transaction — there is no
 * write path here on purpose: a checkpoint list may only be produced by `extract_concepts`
 * (INV-1), so an interview must be able to READ the ruler and never to change it.
 */

export interface ConceptCheckpointRow {
  id: string;
  text: string;
  orderIndex: number;
}

/**
 * The committed checkpoints of one concept, in extraction order — what an examiner is allowed to
 * record evidence against, and nothing beyond it.
 *
 * An empty array means the concept has no ruler (`C = 0`); the §2.4 guard routes it to the text
 * path rather than treating it as an error.
 *
 * `db` lets a caller read on its own transaction client instead of a fresh connection (#340):
 * closing a concept reads the ruler and writes the score it implies inside one transaction, and a
 * read outside it would be a different snapshot from the write it justifies.
 */
export async function listConceptCheckpoints(
  conceptId: string,
  db: Prisma.TransactionClient = prisma
): Promise<ConceptCheckpointRow[]> {
  return db.conceptCheckpoint.findMany({
    where: { conceptId },
    select: { id: true, text: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' },
  });
}

/**
 * `C` for one concept, as a standalone count.
 *
 * What `C` means has not changed: a COUNT OF STORED ROWS, read at the moment it is used — never a
 * number the model reports, never a length carried over from extraction time. Either of those
 * would put a stale or AI-chosen denominator under a mastery score, which is the whole thing INV-1
 * exists to prevent. `0` is a valid answer, not a missing one.
 *
 * ⚠️ Scoring does NOT call this, and currently nothing else does either. `scoreConceptFromEvidence`
 * (`concept-coverage.service.ts`) takes `C` from the length of the checkpoint set it already read,
 * so the denominator and the ids the evidence is joined against come out of ONE statement — a
 * second query here would be the same number from a different moment, and the two disagreeing is
 * precisely how a concept ends up scored against a `C` its own checkpoint set never had. Kept as
 * the plain reading of `C` for a caller that needs the count without the rows; delete it if none
 * appears.
 */
export async function countConceptCheckpoints(conceptId: string): Promise<number> {
  return prisma.conceptCheckpoint.count({ where: { conceptId } });
}
