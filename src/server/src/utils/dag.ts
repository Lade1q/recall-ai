import { ConceptExtract, EdgeExtract } from '../schemas/ai-extract.schema';

export interface DagFixResult {
  edges: EdgeExtract[];
  removedEdges: EdgeExtract[];
  autoFixed: boolean;
}

/**
 * Drops self-loops and edges referencing unknown concepts, then breaks any
 * remaining cycles via Kahn's algorithm so the result is always a valid DAG.
 * Pure function (no AI, no I/O) — unit-testable with mock data, per C4.
 */
export function validateAndFixDag(concepts: ConceptExtract[], edges: EdgeExtract[]): DagFixResult {
  const names = new Set(concepts.map((c) => c.name));
  const removedEdges: EdgeExtract[] = [];

  const sane = edges.filter((e) => {
    const valid = e.from !== e.to && names.has(e.from) && names.has(e.to);
    if (!valid) removedEdges.push(e);
    return valid;
  });

  const seenKeys = new Set<string>();
  const deduped = sane.filter((e) => {
    const key = `${e.from}->${e.to}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, EdgeExtract[]>();
  for (const name of names) {
    inDegree.set(name, 0);
    outgoing.set(name, []);
  }
  for (const e of deduped) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    outgoing.get(e.from)?.push(e);
  }

  const remaining = new Set(deduped);
  const processed = new Set<string>();
  const queue: string[] = [...names].filter((n) => inDegree.get(n) === 0);

  while (remaining.size > 0) {
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || processed.has(node)) continue;
      processed.add(node);
      for (const edge of outgoing.get(node) ?? []) {
        if (!remaining.has(edge)) continue;
        remaining.delete(edge);
        const next = (inDegree.get(edge.to) ?? 0) - 1;
        inDegree.set(edge.to, next);
        if (next === 0) queue.push(edge.to);
      }
    }

    if (remaining.size === 0) break;

    // Cycle: every node still unprocessed has inDegree > 0. Break it by
    // dropping one incoming edge of the first such node (deterministic order).
    const stuckNode = [...names].find((n) => !processed.has(n) && (inDegree.get(n) ?? 0) > 0);
    const incoming = stuckNode ? [...remaining].find((e) => e.to === stuckNode) : undefined;
    if (!stuckNode || !incoming) break; // safety net — should be unreachable

    remaining.delete(incoming);
    removedEdges.push(incoming);
    const next = (inDegree.get(stuckNode) ?? 0) - 1;
    inDegree.set(stuckNode, next);
    if (next === 0) queue.push(stuckNode);
  }

  return {
    edges: deduped.filter((e) => !removedEdges.includes(e)),
    removedEdges,
    autoFixed: removedEdges.length > 0,
  };
}
