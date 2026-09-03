import prisma from '../config/prisma';
import { traceback, type TracebackResult } from './traceback.service';

/**
 * Reads of the prerequisite graph that the *live* interview needs (03/09).
 *
 * `concept-schedule.service.ts` already walks this graph, but only inside the grading
 * transaction and only to write next-session review rows. Live traceback asks the same graph a
 * different question — "what does the student need to see RIGHT NOW" — outside any transaction,
 * so it needs its own read. The decision itself is still `traceback.service.ts`'s pure BFS; this
 * file only fetches its inputs and narrows its output.
 *
 * Deliberately thin, and deliberately not merged into `concept-schedule.service.ts`: that file
 * owns everything that happens *after* a concept is scored and must stay grain-agnostic (§7).
 * Nothing here scores, schedules, or writes.
 */

/**
 * The weak DIRECT prerequisites of `conceptId`, nearest-first.
 *
 * Filtered to `depth === 1` on purpose. The offline walk returns depths 1 and 2 in one go
 * because it is filling a review queue the student will work through later; the live session
 * builds its chain by *recursion* instead — ask the direct base, and if that also goes badly its
 * own direct base gets queued in front of it. Taking depth 2 here as well would queue a
 * grandparent the student may never need, before they have failed the parent.
 *
 * "Weak" is `traceback.service.ts`'s definition and is not restated here: never tested, or
 * scored below `MASTERY_THRESHOLD`. A prerequisite at or above it is skipped and its own
 * prerequisites are not explored (AE-07 AF1) — that pruning is why a solid foundation costs
 * nothing.
 */
export async function findWeakPrerequisites(
  planId: string,
  conceptId: string
): Promise<TracebackResult[]> {
  // The whole plan, same as `scheduleConceptReview` does: the walk needs every concept's score
  // to apply the pruning rule, so a query narrowed to this concept's direct edges could not
  // decide which of them are weak without a second round trip anyway.
  const [concepts, edges] = await Promise.all([
    prisma.concept.findMany({
      where: { planId, status: 'active' },
      select: { id: true, name: true, masteryScore: true },
    }),
    prisma.conceptEdge.findMany({
      where: { planId },
      select: { fromConceptId: true, toConceptId: true },
    }),
  ]);

  return traceback({ rootConceptId: conceptId, concepts, edges }).filter(
    (result) => result.depth === 1
  );
}

/** A concept as the session start needs it, plus why the graph offered it. */
export interface RelatedConcept {
  id: string;
  name: string;
  masteryScore: number | null;
  /** `prerequisite` = the seed is built on it; `dependent` = it is built on the seed. */
  relation: 'prerequisite' | 'dependent';
}

/**
 * The concepts adjacent to `conceptId` in the graph — its direct prerequisites first, then the
 * concepts that depend on it.
 *
 * This is what turns a one-concept deep link into a real session. Every entry point into the
 * interview outside "Dùng gợi ý hôm nay" hands over exactly one concept id
 * (`review-queue-links.ts`, the graph panel, the focus summary), so a session opened from the
 * review queue has always been a session about one concept — the thing UC-11 and the progress
 * meter were never built for. Filling from the graph rather than from the review queue is what
 * makes the extra concepts *related* to the one the student clicked rather than merely due.
 *
 * Prerequisites come first because they are the ones a weak answer would trace back to anyway;
 * within each group the least-mastered concept wins, with a never-tested one counted as the most
 * urgent — the same `null`-is-most-urgent rule the review queue's ordering uses.
 */
export async function findRelatedConcepts(
  planId: string,
  conceptId: string,
  limit: number
): Promise<RelatedConcept[]> {
  if (limit <= 0) return [];

  const edges = await prisma.conceptEdge.findMany({
    where: { planId, OR: [{ toConceptId: conceptId }, { fromConceptId: conceptId }] },
    select: { fromConceptId: true, toConceptId: true },
  });

  const relationById = new Map<string, 'prerequisite' | 'dependent'>();
  for (const edge of edges) {
    // `from` is a prerequisite of `to` (`traceback.service.ts:35`, and the extraction prompt it
    // mirrors). So an edge pointing AT the seed names a prerequisite of it.
    if (edge.toConceptId === conceptId) relationById.set(edge.fromConceptId, 'prerequisite');
    // A concept can be both, in a graph that has a cycle the DAG check let through. Prerequisite
    // wins, because that is the relation the interview acts on — so the guard has to ask about
    // the concept being written (`toConceptId`), not about the seed. Asking about
    // `edge.fromConceptId` here was always true: this branch is only reached when
    // `edge.fromConceptId === conceptId` (the `where` above only matches edges touching the
    // seed), and the seed is only ever a key of this map through a self-loop. The guard read as
    // if it protected the rule stated one line above it while protecting nothing.
    else if (!relationById.has(edge.toConceptId)) {
      relationById.set(edge.toConceptId, 'dependent');
    }
  }
  relationById.delete(conceptId);
  if (relationById.size === 0) return [];

  const concepts = await prisma.concept.findMany({
    where: { id: { in: [...relationById.keys()] }, planId, status: 'active' },
    select: { id: true, name: true, masteryScore: true },
  });

  const urgency = (masteryScore: number | null) => (masteryScore === null ? -1 : masteryScore);

  return concepts
    .map((concept) => ({
      ...concept,
      relation: relationById.get(concept.id) ?? 'dependent',
    }))
    .sort((a, b) => {
      if (a.relation !== b.relation) return a.relation === 'prerequisite' ? -1 : 1;
      return urgency(a.masteryScore) - urgency(b.masteryScore);
    })
    .slice(0, limit);
}
