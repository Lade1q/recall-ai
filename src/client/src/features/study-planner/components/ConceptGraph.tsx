import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Handle,
  Position,
  NodeProps,
  Node,
  ReactFlowInstance,
  MarkerType,
  useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { ConceptNode as ConceptNodeChip, masteryBand } from '@/components/ui/concept-node';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

import { Concept, ConceptEdge } from '../types/concept';
import {
  getLayoutedElements,
  hasCycle,
  toReactFlowEdges,
  toReactFlowNodes,
} from '../utils/graphTransform';

// --- CUSTOM NODE --- (đặt tên GraphNode để không đụng `ConceptNode` của ui/)
function GraphNode({ data, selected }: NodeProps) {
  const isConnectable = useStore((s) => s.nodesConnectable);
  const score = data.mastery as number | null;
  // Tạm thời coi như luôn có nguồn (vì API chưa trả về excerpt) để tránh cờ đỏ toàn bộ.
  // Khi nào API support thì sẽ check dựa trên c.description.
  const difficulty = (data.difficulty as number | undefined) ?? null;

  return (
    <div className={`node ${selected ? 'node--sel' : ''}`}>
      <ConceptNodeChip band={masteryBand(score)} style={{ width: '136px', position: 'relative' }}>
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className={`w-3.5! h-3.5! -left-2 opacity-20 transition-opacity hover:opacity-100 ${!isConnectable ? 'hidden' : ''}`}
        />

        <span>{data.label as string}</span>
        {score !== null && (
          <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.75, fontWeight: 600 }}>
            {Math.round(score * 100)}%
          </span>
        )}

        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className={`w-3.5! h-3.5! -right-2 opacity-20 transition-opacity hover:opacity-100 ${!isConnectable ? 'hidden' : ''}`}
        />
      </ConceptNodeChip>

      <div className="node__diff">
        {difficulty !== null ? `độ khó ${difficulty}/5` : 'có nguồn'}
      </div>
    </div>
  );
}
// -------------------

interface ConceptGraphProps {
  initialConcepts: Concept[];
  initialEdges: ConceptEdge[];
  mode: 'view' | 'edit';
  onConfirm?: (concepts: Concept[], edges: ConceptEdge[]) => Promise<void>;
}

export function ConceptGraph({
  initialConcepts,
  initialEdges,
  mode,
  onConfirm,
}: ConceptGraphProps) {
  const nodeTypes = useMemo(() => ({ conceptNode: GraphNode }), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Add Concept dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const prerequisites = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((e) => e.target === selectedNodeId)
      .map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        return { edgeId: e.id, sourceName: (sourceNode?.data?.label as string) || e.source };
      });
  }, [edges, nodes, selectedNodeId]);

  // Resolve selected edge info for delete bar
  const selectedEdgeInfo = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    return {
      id: edge.id,
      sourceName: (sourceNode?.data?.label as string) || edge.source,
      targetName: (targetNode?.data?.label as string) || edge.target,
    };
  }, [selectedEdgeId, edges, nodes]);

  // Initialize and Layout
  useEffect(() => {
    const rfNodes = toReactFlowNodes(initialConcepts);
    const rfEdges = toReactFlowEdges(initialEdges);

    // Apply dagre layout (LR direction)
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      rfNodes,
      rfEdges,
      'LR'
    );

    setNodes(layoutedNodes as Node[]);
    setEdges(layoutedEdges);
  }, [initialConcepts, initialEdges, setNodes, setEdges]);

  // Fit view to show entire graph when side panel toggles
  useEffect(() => {
    if (rfInstance && nodes.length > 0) {
      // Wait briefly for the side panel to render and CSS flex layout to resize
      setTimeout(() => {
        rfInstance.fitView({ duration: 600, padding: 0.2 });
      }, 50);
    }
  }, [selectedNodeId, rfInstance, nodes.length]);

  // Handle new connections (Edit Mode)
  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (mode !== 'edit') return;

      const newEdge = {
        id: `e_${Date.now()}`,
        type: 'straight',
        animated: false,
        className: 'concept-edge',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: 'var(--mastery-untested)',
        },
        source: params.source,
        target: params.target,
      } as Edge;

      const potentialEdges = [...edges, newEdge];

      if (hasCycle(nodes, potentialEdges)) {
        toast.error('Adding this edge would create a cycle (Vòng lặp). Cạnh đã bị từ chối.');
        return;
      }
      setEdges((eds) => addEdge(newEdge, eds) as Edge[]);
    },
    [mode, edges, nodes, setEdges]
  );

  // Auto Layout action
  const onLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, 'LR');
    setNodes(layoutedNodes as Node[]);
    setEdges(layoutedEdges);
  }, [nodes, edges, setNodes, setEdges]);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setIsUpdating(true);
    try {
      const concepts: Concept[] = nodes.map((n) => ({
        id: n.id,
        name: n.data.label as string,
        description: (n.data.description as string) || undefined,
        mastery_score: n.data.mastery as number | null,
      }));
      const conceptEdges: ConceptEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

      await onConfirm(concepts, conceptEdges);
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi lưu đồ thị.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      toast.info('Đã xóa quan hệ tiên quyết.');
    },
    [setEdges]
  );

  // --- ADD CONCEPT ---
  const handleAddConcept = useCallback(() => {
    const name = newConceptName.trim();
    if (!name) {
      toast.warning('Vui lòng nhập tên khái niệm.');
      return;
    }

    // Check duplicate name
    const isDuplicate = nodes.some(
      (n) => (n.data.label as string).toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
      toast.warning('Khái niệm này đã tồn tại.');
      return;
    }

    const newId = `c_${Date.now()}`;
    const newNode: Node = {
      id: newId,
      type: 'conceptNode',
      data: { label: name, mastery: null, description: '' },
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
    };

    setNodes((nds) => [...nds, newNode]);
    setNewConceptName('');
    setIsAddDialogOpen(false);
    toast.success(`Đã thêm khái niệm "${name}".`);
  }, [newConceptName, nodes, setNodes]);

  // --- DELETE NODE ---
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      // Also remove all edges connected to this node
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
      toast.info('Đã xóa khái niệm.');
    },
    [setNodes, setEdges]
  );

  return (
    <div
      className={`min-h-150 border-border bg-card flex h-full w-full flex-row overflow-hidden rounded-[calc(var(--radius)*1.2)] border`}
    >
      <div className="border-border relative flex min-w-0 flex-1 flex-col border-r">
        {mode === 'edit' && (
          <div className="py-2.75 border-border text-muted-foreground bg-card/80 z-10 flex items-center justify-between gap-3 border-b px-4 text-[12px] backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13 2l-2 12h4l-2 8" />
              </svg>
              <span>Kéo thả để nối quan hệ. Chọn khái niệm để xem nguồn.</span>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-7 text-xs">
                    + Thêm khái niệm
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-106.25">
                  <DialogHeader>
                    <DialogTitle>Thêm khái niệm mới</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Input
                      autoFocus
                      placeholder="Nhập tên khái niệm..."
                      value={newConceptName}
                      onChange={(e) => setNewConceptName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddConcept()}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Hủy
                    </Button>
                    <Button onClick={handleAddConcept}>Thêm khái niệm</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={onLayout}>
                Auto Layout
              </Button>
              <Button
                size="sm"
                className="h-7 px-4 text-xs"
                onClick={handleConfirm}
                disabled={isUpdating}
              >
                {isUpdating ? 'Đang lưu...' : 'Xác nhận & Bắt đầu'}
              </Button>
            </div>
          </div>
        )}

        <div
          className="bg-muted/30 relative flex-1"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, oklch(from var(--foreground) l c h / 0.06) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={mode === 'edit' ? onNodesChange : undefined}
            onEdgesChange={mode === 'edit' ? onEdgesChange : undefined}
            onSelectionChange={(params) => {
              if (params.nodes.length > 0) {
                setSelectedNodeId(params.nodes[0].id);
                setSelectedEdgeId(null);
              } else {
                setSelectedNodeId(null);
              }
            }}
            onEdgeClick={
              mode === 'edit'
                ? (_event, edge) => {
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                  }
                : undefined
            }
            onPaneClick={() => {
              if (mode === 'edit') {
                setSelectedEdgeId(null);
              }
            }}
            onConnect={onConnect}
            onInit={setRfInstance}
            nodesDraggable={mode === 'edit'}
            nodesConnectable={mode === 'edit'}
            elementsSelectable={mode === 'edit'}
            deleteKeyCode={mode === 'edit' ? ['Backspace', 'Delete'] : null}
            fitView
          >
            <Background gap={22} color="transparent" />
            <Controls />
          </ReactFlow>

          {/* Edge delete floating bar */}
          {mode === 'edit' && selectedEdgeInfo && (
            <div className="bg-card/95 border-border animate-in fade-in slide-in-from-bottom-2 absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-lg backdrop-blur-md duration-200">
              <span className="text-muted-foreground">
                Quan hệ:{' '}
                <span className="text-foreground font-medium">{selectedEdgeInfo.sourceName}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-1.5 inline opacity-50"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
                <span className="text-foreground font-medium">{selectedEdgeInfo.targetName}</span>
              </span>
              <button
                type="button"
                className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 rounded-md border px-3 py-1 text-[12px] font-medium transition-colors"
                onClick={() => {
                  handleRemoveEdge(selectedEdgeInfo.id);
                  setSelectedEdgeId(null);
                }}
              >
                Xóa
              </button>
            </div>
          )}

          {nodes.length === 0 && !isUpdating && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground bg-card/80 border-border rounded-lg border px-4 py-2 text-sm backdrop-blur-sm">
                {mode === 'edit'
                  ? 'Đồ thị trống — nhấn "+ Thêm khái niệm" để bắt đầu.'
                  : 'Chưa có khái niệm nào trong đồ thị.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {mode === 'edit' && selectedNode && (
        <aside className="w-70 border-border bg-card absolute bottom-0 right-0 top-0 z-10 flex shrink-0 flex-col gap-4 overflow-y-auto border-l p-[18px_18px_20px] shadow-lg lg:static lg:w-80 lg:border-none lg:shadow-none">
          <div>
            <p className="text-muted-foreground mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.07em]">
              Khái niệm đang chọn
            </p>
            <h2 className="font-heading mb-2 text-[19px] leading-tight tracking-[-0.015em]">
              {selectedNode.data.label as string}
            </h2>
            {(() => {
              const diff = (selectedNode.data.difficulty as number | undefined) ?? null;
              if (diff === null) return null;
              return (
                <div className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
                  <span className="gap-0.75 flex" aria-hidden="true">
                    {Array.from({ length: 5 }, (_, i) => (
                      <i
                        key={i}
                        className={`h-1 w-3.5 rounded-sm ${i < diff ? 'bg-muted-foreground' : 'bg-border'}`}
                      />
                    ))}
                  </span>
                  <span>độ khó {diff}/5 — AI ước lượng</span>
                </div>
              );
            })()}
          </div>

          <div className="bg-border my-1 h-px"></div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">Trích từ tài liệu</span>
            </div>
            {selectedNode.data.description ? (
              <blockquote className="text-muted-foreground border-border m-0 mb-3 text-pretty border-l-[3px] py-0.5 pl-3.5 text-[13.5px] leading-[1.65]">
                {selectedNode.data.description as string}
              </blockquote>
            ) : (
              <p className="text-muted-foreground mb-3 text-[13px] italic">
                Không có trích đoạn gốc.
              </p>
            )}
            <div className="flex gap-4">
              <button
                type="button"
                className="text-destructive decoration-destructive/30 text-[12.5px] font-medium decoration-2 underline-offset-4 hover:underline"
                onClick={() => handleDeleteNode(selectedNode.id)}
              >
                Sai — bỏ khái niệm
              </button>
            </div>
          </div>

          <div className="bg-border my-1 h-px"></div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">Tiên quyết</span>
              <span className="text-muted-foreground font-mono text-[12px]">
                {prerequisites.length} quan hệ
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {prerequisites.length > 0 ? (
                prerequisites.map((req) => (
                  <div
                    key={req.edgeId}
                    className="bg-muted/40 border-border/50 flex items-center justify-between rounded-md border px-3 py-2 text-[13px]"
                  >
                    <span className="mr-2 truncate">{req.sourceName}</span>
                    <button
                      className="opacity-50 transition-opacity hover:opacity-100"
                      type="button"
                      onClick={() => handleRemoveEdge(req.edgeId)}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      >
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-[13px] italic">Không có tiên quyết</p>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
