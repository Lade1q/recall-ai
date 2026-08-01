/**
 * Concept Traceback (AE-07 / I7.1) — reverse BFS over the prerequisite graph.
 *
 * When a concept `C` finishes an interview with a weak mastery score, this walks *backwards*
 * through its prerequisites to find the foundation concepts that are themselves weak, so the
 * next study session can rebuild the base before retrying `C`. This is what separates Recall
 * AI from a flashcard app: it answers "which gap caused this", not just "this was wrong".
 *
 * Pure function — no Prisma, no Gemini, no clock, no randomness. The entire remediation
 * decision is deterministic software logic (C4) and must be provable from mock data alone
 * (SDP risk R05). Loading concepts/edges from the DB, and writing the resulting
 * ReviewQueueItem rows, is I7.2's job — not this file's.
 */

/** At or above this, a concept counts as mastered and needs no review (AE-07 AF1). */
export const MASTERY_THRESHOLD = 0.6;

/**
 * How far back the walk may go. Hard-coded, never taken from a client: a deeper walk makes
 * the next session balloon, which AE-07 E3 exists to prevent.
 */
export const MAX_TRACEBACK_DEPTH = 2;

/**
 * A concept as the algorithm needs it. Declared here rather than imported from
 * `@prisma/client` so the algorithm can be exercised with plain objects and stays runnable
 * with the database switched off.
 */
export interface TracebackConcept {
  id: string;
  name: string;
  masteryScore: number | null;
}

/** `fromConceptId` is a prerequisite of `toConceptId` — learn "from" before "to". */
export interface TracebackEdge {
  fromConceptId: string;
  toConceptId: string;
}

export interface TracebackInput {
  /** The weak concept the walk starts from. It is never itself part of the result. */
  rootConceptId: string;
  concepts: TracebackConcept[];
  edges: TracebackEdge[];
}

/**
 * Why a prerequisite was flagged. A `null` mastery score and a low one both mean "review
 * this", but they are different situations — never studied vs. studied and failed — and the
 * UI words them differently, so the distinction survives to the caller.
 */
export type TracebackReason = 'never_tested' | 'below_threshold';

export interface TracebackResult {
  conceptId: string;
  name: string;
  /** 1 = direct prerequisite of the root, 2 = prerequisite of a prerequisite. */
  depth: number;
  reason: TracebackReason;
  masteryScore: number | null;
}

/** Indexes "concept -> its direct prerequisites" once, so the walk below stays O(V + E). */
function buildPrerequisiteIndex(edges: TracebackEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const edge of edges) {
    const prerequisites = index.get(edge.toConceptId);
    if (prerequisites) {
      prerequisites.push(edge.fromConceptId);
    } else {
      index.set(edge.toConceptId, [edge.fromConceptId]);
    }
  }
  return index;
}

/** True once a concept has been tested and scored at or above the threshold. */
function isMastered(concept: TracebackConcept): boolean {
  return concept.masteryScore !== null && concept.masteryScore >= MASTERY_THRESHOLD;
}

/**
 * Returns the weak prerequisites of `rootConceptId`, nearest first (depth 1 before depth 2).
 * An empty result means there is nothing to remediate — the caller falls back to ordinary
 * spaced repetition for the root concept (AE-07 AF2).
 */
export function traceback(input: TracebackInput): TracebackResult[] {
  const { rootConceptId, concepts, edges } = input;

  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const prerequisitesOf = buildPrerequisiteIndex(edges);

  // The root is the concept being remediated, not a finding. Seeding `visited` with it also
  // breaks any cycle that leads back to it, so a malformed graph cannot loop forever.
  const visited = new Set<string>([rootConceptId]);
  const results: TracebackResult[] = [];

  // Queue holds (id, depth) tuples and `depth` only ever increases when a child is enqueued.
  // That keeps the queue non-decreasing in depth, so `results` comes out nearest-first for
  // free — no sort needed. UC-04's pseudocode instead bumps a single `depth` variable once
  // per dequeue, which stops the walk after three nodes whatever the graph looks like;
  // UC-Overview §5.3 records that as a bug. This follows the corrected version.
  const queue = (prerequisitesOf.get(rootConceptId) ?? []).map((id) => ({ id, depth: 1 }));

  while (queue.length > 0) {
    const current = queue.shift();
    // A shared prerequisite reaches the queue once per path into it; the first dequeue wins,
    // which is also the shallowest one, so it is reported at the depth nearest the root.
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);

    const concept = conceptById.get(current.id);
    // An edge can outlive the concept it points at (graph edited between sessions).
    // Treat the target as absent instead of throwing — AE-07 has no error flow for this.
    if (!concept) continue;

    // AE-07 AF1: a mastered prerequisite is skipped *and* its own prerequisites are left
    // unvisited — if P is solid, whatever P is built on is solid enough too. Enqueuing P's
    // parents here anyway is the classic misreading of this flow, so it has its own test.
    if (isMastered(concept)) continue;

    results.push({
      conceptId: concept.id,
      name: concept.name,
      depth: current.depth,
      reason: concept.masteryScore === null ? 'never_tested' : 'below_threshold',
      masteryScore: concept.masteryScore,
    });

    if (current.depth < MAX_TRACEBACK_DEPTH) {
      for (const prerequisiteId of prerequisitesOf.get(current.id) ?? []) {
        queue.push({ id: prerequisiteId, depth: current.depth + 1 });
      }
    }
  }

  return results;
}
