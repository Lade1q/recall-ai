/**
 * An edge between two node keys. Callers pick the key space: concept names for the
 * AI extraction flow (I3.2, names not yet persisted), concept UUIDs for a graph
 * already stored in the DB (I3.3).
 */
export interface GraphEdge {
  from: string;
  to: string;
}

export interface DagFixResult<E extends GraphEdge> {
  edges: E[];
  removedEdges: E[];
  autoFixed: boolean;
}

/**
 * Drops self-loops and edges referencing unknown nodes, then breaks any
 * remaining cycles via Kahn's algorithm so the result is always a valid DAG.
 * Pure function (no AI, no I/O) — unit-testable with mock data, per C4 and SDP risk R05.
 *
 * The caller decides what `removedEdges` means:
 * - AI extraction (SP-01 AF3): accept the fix and flag `plan.dag_auto_fixed`.
 * - Manual edit (SDP 4.3.2 R03): reject the whole change, keep the stored graph.
 */
export function validateAndFixDag<E extends GraphEdge>(
  nodeIds: string[],
  edges: E[]
): DagFixResult<E> {
  const nodes = new Set(nodeIds);
  const removedEdges: E[] = [];

  const sane = edges.filter((e) => {
    const valid = e.from !== e.to && nodes.has(e.from) && nodes.has(e.to);
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
  const outgoing = new Map<string, E[]>();
  for (const node of nodes) {
    inDegree.set(node, 0);
    outgoing.set(node, []);
  }
  for (const e of deduped) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    outgoing.get(e.from)?.push(e);
  }

  const remaining = new Set(deduped);
  const processed = new Set<string>();
  const queue: string[] = [...nodes].filter((n) => inDegree.get(n) === 0);

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
    const stuckNode = [...nodes].find((n) => !processed.has(n) && (inDegree.get(n) ?? 0) > 0);
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
