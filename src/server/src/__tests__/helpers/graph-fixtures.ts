import { TracebackConcept, TracebackEdge } from '../../services/traceback.service';
import { GraphEdge } from '../../utils/dag';

export interface MockGraph {
  concepts: TracebackConcept[];
  edges: TracebackEdge[];
  dagEdges: GraphEdge[];
}

/**
 * Helper to build graphs for unit tests.
 * Syntax: "A(0.9) -> B(null), B(null) -> C(0.4)"
 * Where "A(0.9)" means concept A has masteryScore 0.9.
 * If no score is provided, e.g. "A -> B", it defaults to null.
 * Single nodes without edges are also supported: "A(0.5)".
 *
 * Example:
 * makeGraph("A(0.9) -> B(0.2) -> C(null)")
 */
export function makeGraph(spec: string): MockGraph {
  const conceptsMap = new Map<string, TracebackConcept>();
  const edges: TracebackEdge[] = [];
  const dagEdges: GraphEdge[] = [];

  const parseNode = (nodeStr: string): string => {
    const match = nodeStr.trim().match(/^([a-zA-Z0-9_]+)(?:\(([^)]+)\))?$/);
    if (!match) throw new Error(`Invalid node spec: ${nodeStr}`);

    const id = match[1];
    if (!id) throw new Error(`Missing ID in node spec: ${nodeStr}`);

    let score: number | null = null;
    const scoreMatch = match[2];
    if (scoreMatch && scoreMatch !== 'null') {
      score = parseFloat(scoreMatch);
    }

    // Only set score if it's explicitly provided in this occurrence or it's the first time
    if (!conceptsMap.has(id)) {
      conceptsMap.set(id, { id, name: `Concept ${id}`, masteryScore: score });
    } else if (scoreMatch) {
      // Update score if it's explicitly given again
      conceptsMap.get(id)!.masteryScore = score;
    }

    return id;
  };

  const parts = spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const nodes = part.split('->').map((s) => s.trim());
    for (let i = 0; i < nodes.length - 1; i++) {
      const fromStr = nodes[i];
      const toStr = nodes[i + 1];
      if (!fromStr || !toStr) continue;

      const fromId = parseNode(fromStr);
      const toId = parseNode(toStr);
      edges.push({ fromConceptId: fromId, toConceptId: toId });
      dagEdges.push({ from: fromId, to: toId });
    }
    // Handle single node without edges
    if (nodes.length === 1) {
      const singleNode = nodes[0];
      if (singleNode) {
        parseNode(singleNode);
      }
    }
  }

  return {
    concepts: Array.from(conceptsMap.values()),
    edges,
    dagEdges,
  };
}
