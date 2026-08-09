import {
  traceback,
  MASTERY_THRESHOLD,
  MAX_TRACEBACK_DEPTH,
  TracebackConcept,
  TracebackEdge,
} from '../services/traceback.service';

/**
 * Covers the reverse-BFS traceback (AE-07 / I7.1). Everything here runs on plain objects:
 * no database, no GEMINI_API_KEY, no clock. That is the point of the algorithm being pure
 * (SDP risk R05) and these tests are the proof.
 *
 * Graphs are written prerequisite-first: `edge('P1', 'C')` reads "P1 is a prerequisite of C",
 * so a chain `C <- P1 <- P2` means P2 is the deepest foundation.
 */

const ROOT = 'C';

function concept(id: string, masteryScore: number | null): TracebackConcept {
  return { id, name: `Concept ${id}`, masteryScore };
}

/** `edge('P1', 'C')` = P1 is a prerequisite of C. */
function edge(fromConceptId: string, toConceptId: string): TracebackEdge {
  return { fromConceptId, toConceptId };
}

/** The root is always weak — it is why traceback ran — so its own score never matters. */
const WEAK_ROOT = concept(ROOT, 0.2);

describe('traceback', () => {
  it('returns nothing when the concept has no prerequisites', () => {
    // AE-07 AF2: nothing to remediate, so I7.2 falls back to plain spaced repetition.
    const result = traceback({ rootConceptId: ROOT, concepts: [WEAK_ROOT], edges: [] });

    expect(result).toEqual([]);
  });

  it('flags a direct prerequisite scoring below the threshold', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.3)],
      edges: [edge('P1', ROOT)],
    });

    expect(result).toEqual([
      {
        conceptId: 'P1',
        name: 'Concept P1',
        depth: 1,
        reason: 'below_threshold',
        masteryScore: 0.3,
      },
    ]);
  });

  it('flags a never-tested prerequisite and says so, rather than calling it a low score', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', null)],
      edges: [edge('P1', ROOT)],
    });

    expect(result).toEqual([
      {
        conceptId: 'P1',
        name: 'Concept P1',
        depth: 1,
        reason: 'never_tested',
        masteryScore: null,
      },
    ]);
  });

  it('skips a direct prerequisite that is already mastered', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.9)],
      edges: [edge('P1', ROOT)],
    });

    expect(result).toEqual([]);
  });

  it('prunes: a mastered prerequisite hides its own weak prerequisites', () => {
    // AE-07 AF1 — the case that is easy to get wrong by skipping P1 but still enqueuing P2.
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.9), concept('P2', 0.1)],
      edges: [edge('P1', ROOT), edge('P2', 'P1')],
    });

    expect(result).toEqual([]);
  });

  it('walks two levels down when both are weak, nearest first', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.2), concept('P2', 0.1)],
      edges: [edge('P1', ROOT), edge('P2', 'P1')],
    });

    expect(result.map((r) => [r.conceptId, r.depth])).toEqual([
      ['P1', 1],
      ['P2', 2],
    ]);
  });

  it('stops at the depth cap even when a third level is weak', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.2), concept('P2', 0.1), concept('P3', 0.0)],
      edges: [edge('P1', ROOT), edge('P2', 'P1'), edge('P3', 'P2')],
    });

    expect(result.map((r) => r.conceptId)).toEqual(['P1', 'P2']);
    expect(Math.max(...result.map((r) => r.depth))).toBe(MAX_TRACEBACK_DEPTH);
  });

  it('reports a prerequisite shared by two branches only once', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.2), concept('P2', 0.3), concept('P3', 0.1)],
      edges: [edge('P1', ROOT), edge('P2', ROOT), edge('P3', 'P1'), edge('P3', 'P2')],
    });

    expect(result.filter((r) => r.conceptId === 'P3')).toHaveLength(1);
    expect(result.map((r) => r.conceptId)).toEqual(['P1', 'P2', 'P3']);
  });

  it('returns nothing for an empty graph or an unknown root, without throwing', () => {
    expect(traceback({ rootConceptId: ROOT, concepts: [], edges: [] })).toEqual([]);
    expect(
      traceback({
        rootConceptId: 'does-not-exist',
        concepts: [WEAK_ROOT, concept('P1', 0.1)],
        edges: [edge('P1', ROOT)],
      })
    ).toEqual([]);
  });

  // --- Boundaries and malformed input the table above does not pin down ------------------

  it('treats a score exactly at the threshold as mastered', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', MASTERY_THRESHOLD)],
      edges: [edge('P1', ROOT)],
    });

    expect(result).toEqual([]);
  });

  it('separates a tested-and-failed zero from a never-tested null', () => {
    // The constraint the schema cannot express: 0.0 and null both need review, but they are
    // different findings and I6.7 words them differently.
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.0), concept('P2', null)],
      edges: [edge('P1', ROOT), edge('P2', ROOT)],
    });

    expect(result.map((r) => [r.conceptId, r.reason])).toEqual([
      ['P1', 'below_threshold'],
      ['P2', 'never_tested'],
    ]);
  });

  it('orders every depth-1 finding before any depth-2 finding', () => {
    // P1's own prerequisite (P3, depth 2) is discovered before P2 (depth 1) is dequeued, so
    // this fails if the walk ever turns depth-first or the queue stops being FIFO.
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.1), concept('P2', 0.2), concept('P3', 0.3)],
      edges: [edge('P1', ROOT), edge('P2', ROOT), edge('P3', 'P1')],
    });

    expect(result.map((r) => r.depth)).toEqual([1, 1, 2]);
    expect(result.map((r) => r.conceptId)).toEqual(['P1', 'P2', 'P3']);
  });

  it('terminates on a cyclic graph and never reports the root as its own gap', () => {
    // The graph is validated as a DAG upstream (I3.3), but a cycle here must not hang the
    // request — `visited` is seeded with the root precisely so this stays bounded.
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.1)],
      edges: [edge('P1', ROOT), edge(ROOT, 'P1')],
    });

    expect(result.map((r) => r.conceptId)).toEqual(['P1']);
  });

  it('ignores an edge pointing at a concept that is no longer in the graph', () => {
    const result = traceback({
      rootConceptId: ROOT,
      concepts: [WEAK_ROOT, concept('P1', 0.1)],
      edges: [edge('P1', ROOT), edge('deleted-concept', ROOT)],
    });

    expect(result.map((r) => r.conceptId)).toEqual(['P1']);
  });

  it('does not mutate the input arrays', () => {
    const concepts = [WEAK_ROOT, concept('P1', 0.1)];
    const edges = [edge('P1', ROOT)];

    traceback({ rootConceptId: ROOT, concepts, edges });

    expect(concepts).toHaveLength(2);
    expect(edges).toEqual([{ fromConceptId: 'P1', toConceptId: ROOT }]);
  });

  it('limits traceback to MAX_TRACEBACK_DEPTH for a 5-level deep graph of weak concepts', () => {
    // Graph: E -> D -> C -> B -> A (root)
    // Depths: B=1, C=2, D=3, E=4
    const concepts = [
      concept('A', 0.2),
      concept('B', 0.2),
      concept('C', 0.2),
      concept('D', 0.2),
      concept('E', 0.2),
    ];
    const edges = [edge('B', 'A'), edge('C', 'B'), edge('D', 'C'), edge('E', 'D')];

    const result = traceback({ rootConceptId: 'A', concepts, edges });

    // Should only return B (depth 1) and C (depth 2)
    expect(result.map((r) => r.conceptId)).toEqual(['B', 'C']);
    expect(Math.max(...result.map((r) => r.depth))).toBe(2); // MAX_TRACEBACK_DEPTH
  });
});
