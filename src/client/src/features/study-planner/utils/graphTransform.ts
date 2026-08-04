import { Node, Edge, Position, MarkerType } from '@xyflow/react';
import dagre from 'dagre';
import { Concept, ConceptEdge } from '../types/concept';

/**
 * Bề rộng node theo mockup: 174px ở view mode (screen-concept-graph.html — node mang cả
 * tên lẫn `mastery_score`) và 136px ở edit mode (screen-create-plan.html — chỉ có tên).
 * Dagre phải biết đúng con số đang vẽ, nếu không các rank ở layout LR sẽ chồng lên nhau.
 */
export const NODE_WIDTH_VIEW = 174;
export const NODE_WIDTH_EDIT = 136;
const NODE_HEIGHT = 42;

// Transform API Concepts to React Flow Nodes
export function toReactFlowNodes(concepts: Concept[]): Node[] {
  return concepts.map((c) => ({
    id: c.id,
    type: 'conceptNode',
    data: {
      label: c.name,
      mastery: c.mastery_score,
      difficulty: c.difficulty ?? null,
      // Provenance quyết định câu chữ quanh `difficulty` — xem `ConceptSource`.
      source: c.source ?? null,
      // DB-05/DB-06 (Issue #168): dải "đang ôn lại" độc lập với mastery band, và last_tested_at
      // cho hover tooltip + panel chi tiết.
      lastTestedAt: c.lastTestedAt ?? null,
      isRemediating: c.isRemediating ?? false,
    },
    position: { x: 0, y: 0 }, // Position will be overwritten by dagre layout
  }));
}

// Transform API Edges to React Flow Edges
export function toReactFlowEdges(edges: ConceptEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    type: 'straight',
    className: 'concept-edge', // allow CSS overriding
    style: {
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: 'var(--mastery-untested)',
    },
  }));
}

// Layout graph using Dagre
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = 'TB',
  nodeWidth: number = NODE_WIDTH_EDIT
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    // Estimating node dimensions. Adjust these values based on actual styling.
    dagreGraph.setNode(node.id, { width: nodeWidth, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: (isHorizontal ? 'left' : 'top') as Position,
      sourcePosition: (isHorizontal ? 'right' : 'bottom') as Position,
      // Shift node position so the origin is at the top-left instead of center
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Detect cycles in the directed graph
export function hasCycle(nodes: Node[], edges: Edge[]): boolean {
  const adjacencyList = new Map<string, string[]>();

  // Initialize adjacency list
  nodes.forEach((node) => {
    adjacencyList.set(node.id, []);
  });

  edges.forEach((edge) => {
    const neighbors = adjacencyList.get(edge.source);
    if (neighbors) {
      neighbors.push(edge.target);
    }
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function isCyclicUtil(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (isCyclicUtil(neighbor)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (isCyclicUtil(node.id)) {
      return true;
    }
  }

  return false;
}
