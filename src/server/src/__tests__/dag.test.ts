import { validateAndFixDag } from '../utils/dag';

/**
 * Unit tests for the DAG validation of the Concept Graph Engine (I3.3).
 * No DB, no Gemini key — the algorithm has to be provable on its own (SDP risk R05).
 * Nodes are plain string keys, so these cases hold for both the name-keyed AI flow
 * and the id-keyed flow over a graph already stored in the database.
 */
describe('validateAndFixDag', () => {
  it('accepts an acyclic graph (A -> B -> C)', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];

    const result = validateAndFixDag(['A', 'B', 'C'], edges);

    expect(result.autoFixed).toBe(false);
    expect(result.removedEdges).toEqual([]);
    expect(result.edges).toEqual(edges);
  });

  it('breaks a cycle (A -> B -> C -> A) by removing the edge that closes it', () => {
    const closingEdge = { from: 'C', to: 'A' };
    const edges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, closingEdge];

    const result = validateAndFixDag(['A', 'B', 'C'], edges);

    expect(result.autoFixed).toBe(true);
    expect(result.removedEdges).toEqual([closingEdge]);
    expect(result.edges).toEqual([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]);
  });

  it('accepts an empty graph', () => {
    const result = validateAndFixDag([], []);

    expect(result.autoFixed).toBe(false);
    expect(result.removedEdges).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('accepts a single node with no edges', () => {
    const result = validateAndFixDag(['A'], []);

    expect(result.autoFixed).toBe(false);
    expect(result.removedEdges).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('drops an edge that references a node outside the graph', () => {
    const danglingEdge = { from: 'A', to: 'Ghost' };

    const result = validateAndFixDag(['A', 'B'], [{ from: 'A', to: 'B' }, danglingEdge]);

    expect(result.autoFixed).toBe(true);
    expect(result.removedEdges).toEqual([danglingEdge]);
    expect(result.edges).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('collapses duplicate edges without reporting them as removed', () => {
    // The DB has a unique constraint on (plan_id, from_concept_id, to_concept_id),
    // so duplicates from the AI must be collapsed before any insert is attempted.
    const result = validateAndFixDag(
      ['A', 'B'],
      [
        { from: 'A', to: 'B' },
        { from: 'A', to: 'B' },
      ]
    );

    expect(result.autoFixed).toBe(false);
    expect(result.removedEdges).toEqual([]);
    expect(result.edges).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('preserves extra properties on the edges it returns', () => {
    // The DB-keyed caller carries the edge row id through so it can delete by id.
    const result = validateAndFixDag(
      ['a1', 'a2'],
      [
        { id: 'e1', from: 'a1', to: 'a2' },
        { id: 'e2', from: 'a2', to: 'a1' },
      ]
    );

    expect(result.removedEdges).toEqual([{ id: 'e2', from: 'a2', to: 'a1' }]);
    expect(result.edges).toEqual([{ id: 'e1', from: 'a1', to: 'a2' }]);
  });
});
