import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  Connection,
  Edge,
  Handle,
  Position,
  NodeProps,
  NodeToolbar,
  Node,
  ReactFlowInstance,
  MarkerType,
  useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import {
  ConceptNode as ConceptNodeChip,
  masteryBand,
  masteryLabel,
  type MasteryBand,
} from '@/components/ui/concept-node';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { Concept, ConceptEdge } from '../types/concept';
import {
  NODE_WIDTH_EDIT,
  NODE_WIDTH_VIEW,
  getLayoutedElements,
  hasCycle,
  toReactFlowEdges,
  toReactFlowNodes,
} from '../utils/graphTransform';
import { formatRelativeDays } from '../utils/planDates';
import { ConceptDetailPanel, type RelatedConcept } from './ConceptDetailPanel';
import { ConceptSourcesSection } from './ConceptSources';

/** Trên 50 node, UC-17 [E1] yêu cầu mặc định chỉ vẽ vùng quanh node chưa vững. */
const LARGE_GRAPH_THRESHOLD = 50;

type MasteryFilter = 'all' | 'strong' | 'learning' | 'weak' | 'untested';

/** Bốn mức mastery theo thứ tự vững → yếu, khớp chú giải ở dashboard và danh sách kế hoạch. */
const BAND_ORDER = ['strong', 'learning', 'weak', 'untested'] as const;

const BAND_COLOR_VAR: Record<(typeof BAND_ORDER)[number], string> = {
  strong: 'var(--mastery-strong)',
  learning: 'var(--mastery-learning)',
  weak: 'var(--mastery-weak)',
  untested: 'var(--mastery-untested)',
};

// Tailwind cần thấy tên class đầy đủ, tĩnh, để không bị purge — không nội suy `text-mastery-${band}`.
const BAND_TEXT_CLASS: Record<Exclude<MasteryBand, 'remediating'>, string> = {
  strong: 'text-mastery-strong',
  learning: 'text-mastery-learning',
  weak: 'text-mastery-weak',
  untested: 'text-muted-foreground',
};

// --- CUSTOM NODE --- (đặt tên GraphNode để không đụng `ConceptNode` của ui/)
function GraphNode({ data, selected }: NodeProps) {
  const isConnectable = useStore((s) => s.nodesConnectable);
  const [isHovered, setIsHovered] = useState(false);
  const score = data.mastery as number | null;
  const band = masteryBand(score);
  const isEditMode = data.mode === 'edit';
  const difficulty = (data.difficulty as number | undefined) ?? null;
  // Khái niệm người dùng tự thêm không có độ khó do ai ước lượng: server đặt mặc định 1 khi
  // tạo. Hiện con số đó lên là bịa ra một dữ kiện — nói thẳng nguồn gốc node thì đúng hơn.
  const isManual = data.source === 'manual';
  const lastTestedAt = (data.lastTestedAt as string | null | undefined) ?? null;
  const isRemediating = Boolean(data.isRemediating);
  const dependentCount = (data.dependentCount as number | undefined) ?? 0;

  return (
    <div
      className={cn('node', selected && isEditMode && 'node--sel')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <ConceptNodeChip
        band={band}
        className={cn(
          // View mode: bố cục hàng (tên trái · điểm phải). Edit mode: chỉ có tên căn giữa như
          // screen-create-plan.html — lúc kiểm chứng đồ thị chưa có phiên kiểm tra nào, điểm số
          // chưa có nghĩa; thông tin của bước đó là độ khó (node__diff bên dưới).
          !isEditMode && 'concept-node--row',
          isRemediating && 'is-remediating',
          // Hai kiểu "đang chọn" khác nhau có chủ đích — xem `.node--sel` / `.is-selected`
          // trong global.css.
          selected && !isEditMode && 'is-selected'
        )}
        style={{
          width: `${isEditMode ? NODE_WIDTH_EDIT : NODE_WIDTH_VIEW}px`,
          position: 'relative',
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          // `invisible` (visibility:hidden), không phải `hidden` (display:none): react-flow đo
          // vị trí cạnh qua getBoundingClientRect() của chính Handle này — display:none làm nó
          // rời khỏi layout hoàn toàn, khiến MỌI cạnh ở view mode (isConnectable=false) sụp về
          // một điểm ngoài khung nhìn dù dữ liệu concept/edge vẫn đúng. invisible giữ handle
          // trong layout (đo được) mà vẫn không vẽ ra.
          className={`w-3.5! h-3.5! -left-2 opacity-20 transition-opacity hover:opacity-100 ${!isConnectable ? 'invisible' : ''}`}
        />

        <span className={isEditMode ? undefined : 'concept-node__name'}>
          {data.label as string}
        </span>
        {/* Con số luôn hiện ở view mode, kể cả khi chưa đo (—): màu là kênh thứ nhất, số là
            kênh thứ hai (ràng buộc C6). */}
        {!isEditMode && (
          <span className="concept-node__score">{score !== null ? score.toFixed(2) : '—'}</span>
        )}

        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className={`w-3.5! h-3.5! -right-2 opacity-20 transition-opacity hover:opacity-100 ${!isConnectable ? 'invisible' : ''}`}
        />
      </ConceptNodeChip>

      {/* Độ khó chỉ có nghĩa lúc kiểm chứng đồ thị (screen-create-plan.html); ở view mode
          chỗ đó thuộc về mastery_score, thứ đã nằm ngay trong node. */}
      {isEditMode && (
        <div className="node__diff">
          {isManual
            ? 'bạn tự thêm'
            : difficulty !== null
              ? `độ khó ${difficulty}/5`
              : 'chưa rõ độ khó'}
        </div>
      )}

      {/* DB-02 bước 3: hover tóm tắt nhanh — click mới mở panel đầy đủ (DB-06). Node đã mang
          sẵn điểm số, nên thứ tooltip thêm vào là THỜI ĐIỂM: 0.42 đo hôm qua khác hẳn 0.42
          đo ba tuần trước.
          Dùng NodeToolbar (không phải absolute + z-index) vì tooltip là con của
          `.react-flow__node`, mà react-flow gắn inline `transform` lên chính node đó — transform
          tạo stacking context mới nên z-index của tooltip chỉ so được với anh em bên trong node,
          không "thoát" ra để nổi trên các node khác. NodeToolbar portal nội dung ra ngoài cây
          node nên luôn vẽ trên cùng, bất kể node nào khác đang chọn/đè lên. */}
      <NodeToolbar isVisible={isHovered} position={Position.Top} offset={6}>
        <div className="bg-card border-border shadow-soft px-2.75 pointer-events-none w-max max-w-60 rounded-[calc(var(--radius)*0.7)] border py-2 text-[12px]">
          <span className="font-medium">{data.label as string}</span>
          <span
            className={`ml-2 font-mono text-[11px] font-semibold tabular-nums ${BAND_TEXT_CLASS[band]}`}
          >
            {score !== null ? score.toFixed(2) : '—'}
          </span>
          <div className="text-muted-foreground mt-0.75 break-words font-mono text-[10.5px]">
            {lastTestedAt
              ? `kiểm tra lần cuối ${formatRelativeDays(lastTestedAt)}`
              : 'chưa kiểm tra'}
            {` · ${dependentCount} khái niệm phụ thuộc`}
          </div>
        </div>
      </NodeToolbar>
    </div>
  );
}
// -------------------

/**
 * Zoom & pan (DB-02 bước 3). Thay cho `<Controls />` mặc định của react-flow, vốn là một cột
 * bốn nút không nói mức zoom hiện tại là bao nhiêu — mockup yêu cầu đọc được con số đó.
 * Phải là con của `<ReactFlow>` để `useReactFlow()` thấy được store.
 */
function ViewportControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  const buttonClass =
    'hover:bg-accent flex h-7.5 w-7.5 items-center justify-center rounded-[calc(var(--radius)*0.5)] text-[15px] transition-colors';

  return (
    <Panel
      position="bottom-right"
      className="border-border bg-card shadow-soft m-4! flex items-center gap-1 rounded-md border p-1"
    >
      <button type="button" className={buttonClass} title="Thu nhỏ" onClick={() => zoomOut()}>
        −
      </button>
      <span className="text-muted-foreground min-w-11 px-1.5 text-center font-mono text-[12px] tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" className={buttonClass} title="Phóng to" onClick={() => zoomIn()}>
        +
      </button>
      <span className="bg-border h-4.5 mx-0.5 w-px" />
      <button
        type="button"
        className={buttonClass}
        title="Vừa khung hình"
        aria-label="Vừa khung hình"
        onClick={() => fitView({ duration: 400, padding: 0.2 })}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </Panel>
  );
}

/** Chú giải CẠNH — đồ thị có ba kiểu cạnh, và cạnh mới là thứ chở lập luận truy ngược AE-07. */
function EdgeLegend() {
  const items = [
    { stroke: 'var(--border)', width: 1.5, dash: undefined, label: 'Quan hệ tiên quyết' },
    {
      stroke: 'var(--foreground)',
      width: 2,
      dash: undefined,
      label: 'Liên quan tới khái niệm đang chọn',
    },
    {
      stroke: 'var(--mastery-weak)',
      width: 2,
      dash: '4 3',
      // Không để lộ mã use-case nội bộ (AE-07) ra UI người dùng — thay bằng ý nghĩa thật của
      // nét cạnh: đây là tiên quyết còn yếu của khái niệm đang chọn, nên ôn nó trước.
      label: 'Tiên quyết còn yếu — nên ôn trước',
    },
  ];

  return (
    <Panel
      position="bottom-left"
      className="border-border bg-card text-muted-foreground m-4! px-3.25 py-2.25 flex max-w-[min(100%-8rem,32rem)] flex-wrap gap-x-4 gap-y-1.5 rounded-md border text-[11px]"
    >
      {items.map((item) => (
        <span key={item.label} className="gap-1.75 flex items-center">
          <svg width="26" height="8" className="shrink-0" aria-hidden="true">
            <line
              x1="0"
              y1="4"
              x2="26"
              y2="4"
              stroke={item.stroke}
              strokeWidth={item.width}
              strokeDasharray={item.dash}
            />
          </svg>
          {item.label}
        </span>
      ))}
    </Panel>
  );
}

/** Chip lọc DB-05 — dùng chung cho 4 mức mastery + "Đang ôn lại". */
function FilterChip({
  active,
  disabled,
  color,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'border-border gap-1.75 inline-flex shrink-0 items-center whitespace-nowrap rounded-[calc(var(--radius)*0.7)] border px-3 py-1.5 text-[12px] font-medium transition-colors',
        active
          ? 'bg-primary border-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-45'
      )}
    >
      {color && <i className="rounded-xs block h-2 w-2 shrink-0" style={{ background: color }} />}
      {children}
    </button>
  );
}

interface ConceptGraphProps {
  /** Cần cho ConceptDetailPanel (DB-06) và điều hướng sang FS-01/AE-01. */
  planId: string;
  initialConcepts: Concept[];
  initialEdges: ConceptEdge[];
  mode: 'view' | 'edit';
  onConfirm?: (concepts: Concept[], edges: ConceptEdge[]) => Promise<void>;
  /**
   * Nhãn nút xác nhận ở edit mode. Mặc định là ngôn ngữ luồng tạo mới ("Xác nhận & Bắt đầu");
   * khi sửa kế hoạch đã có, nơi gọi truyền "Lưu thay đổi" thay vì "bắt đầu" một thứ đã chạy.
   */
  confirmLabel?: string;
  onCancel?: () => void;
  isDraft?: boolean;
}

export function ConceptGraph({
  planId,
  initialConcepts,
  initialEdges,
  mode,
  onConfirm,
  confirmLabel = 'Xác nhận & Bắt đầu',
  onCancel,
  isDraft = false,
}: ConceptGraphProps) {
  const navigate = useNavigate();
  const nodeTypes = useMemo(() => ({ conceptNode: GraphNode }), []);
  const nodeWidth = mode === 'edit' ? NODE_WIDTH_EDIT : NODE_WIDTH_VIEW;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Add Concept dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');

  // Cancel & Dirty state
  const [isDirty, setIsDirty] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  const handleCancelClick = useCallback(() => {
    if (isDirty) {
      setIsCancelDialogOpen(true);
    } else if (onCancel) {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const confirmCancel = useCallback(() => {
    setIsCancelDialogOpen(false);
    if (onCancel) onCancel();
  }, [onCancel]);

  // --- DB-05: lọc & tìm kiếm (chỉ có ý nghĩa ở mode='view') ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBand, setFilterBand] = useState<MasteryFilter>('all');
  const [filterRemediating, setFilterRemediating] = useState(false);
  const [showAllNodes, setShowAllNodes] = useState(false);

  // Kế hoạch mới (hoặc phân tích lại) → bỏ bộ lọc cũ, không mang lọc của kế hoạch trước sang.
  // Điều chỉnh state ngay trong lúc render (React's "adjusting state when a prop changes"
  // pattern, dùng useState để nhớ giá trị trước chứ không phải useRef — đọc/ghi `ref.current`
  // lúc render bị react-hooks/refs cấm) thay vì một effect riêng, để tránh cascading render
  // mà react-hooks/set-state-in-effect cảnh báo.
  const [prevGraph, setPrevGraph] = useState({ concepts: initialConcepts, edges: initialEdges });
  if (prevGraph.concepts !== initialConcepts || prevGraph.edges !== initialEdges) {
    setPrevGraph({ concepts: initialConcepts, edges: initialEdges });
    setSearchQuery('');
    setFilterBand('all');
    setFilterRemediating(false);
    setShowAllNodes(false);
    setSelectedNodeId(null);
  }

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const prerequisites = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((e) => e.target === selectedNodeId)
      .map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        return { edgeId: e.id, sourceName: (sourceNode?.data?.label as string) || e.source };
      });
  }, [edges, nodes, selectedNodeId]);

  // DB-06: tiên quyết/hậu kế cho panel chi tiết — tính từ đồ thị client đã có sẵn (xem lý do
  // trong ConceptDetailResponse phía server), giữ tên/điểm số khớp với canvas.
  const prerequisitesForDetail = useMemo<RelatedConcept[]>(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((e) => e.target === selectedNodeId)
      .flatMap((e) => {
        const n = nodeById.get(e.source);
        if (!n) return [];
        return [
          {
            id: n.id,
            name: n.data.label as string,
            masteryScore: (n.data.mastery as number | null) ?? null,
            isRemediating: Boolean(n.data.isRemediating),
          },
        ];
      });
  }, [edges, selectedNodeId, nodeById]);

  const dependentsForDetail = useMemo<RelatedConcept[]>(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((e) => e.source === selectedNodeId)
      .flatMap((e) => {
        const n = nodeById.get(e.target);
        if (!n) return [];
        return [
          {
            id: n.id,
            name: n.data.label as string,
            masteryScore: (n.data.mastery as number | null) ?? null,
            isRemediating: Boolean(n.data.isRemediating),
          },
        ];
      });
  }, [edges, selectedNodeId, nodeById]);

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

  // --- DB-05 derived state ---
  const bandCounts = useMemo(() => {
    const counts: Record<(typeof BAND_ORDER)[number], number> = {
      strong: 0,
      learning: 0,
      weak: 0,
      untested: 0,
    };
    initialConcepts.forEach((c) => {
      counts[masteryBand(c.mastery_score)] += 1;
    });
    return counts;
  }, [initialConcepts]);
  const weakCount = bandCounts.weak;
  const untestedCount = bandCounts.untested;
  // UC-17 [E2]: chưa có phiên kiểm tra nào — lọc theo một cột toàn null là thao tác rỗng.
  const allUntested = initialConcepts.length > 0 && untestedCount === initialConcepts.length;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  // `allUntested` chỉ vô hiệu hóa vế lọc-theo-mức: tên khái niệm và cờ "đang ôn lại" không
  // phụ thuộc mastery nên vẫn phải lọc được trên một đồ thị chưa qua phiên kiểm tra nào.
  const hasActiveFilter =
    mode === 'view' &&
    (trimmedQuery !== '' || filterRemediating || (filterBand !== 'all' && !allUntested));

  const matchedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    nodes.forEach((n) => {
      const label = String(n.data.label ?? '').toLowerCase();
      const band = masteryBand((n.data.mastery as number | null) ?? null);
      const remediating = Boolean(n.data.isRemediating);
      if (trimmedQuery && !label.includes(trimmedQuery)) return;
      if (filterBand !== 'all' && band !== filterBand) return;
      if (filterRemediating && !remediating) return;
      ids.add(n.id);
    });
    return ids;
  }, [nodes, trimmedQuery, filterBand, filterRemediating]);

  const noMatches = hasActiveFilter && nodes.length > 0 && matchedNodeIds.size === 0;

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setFilterBand('all');
    setFilterRemediating(false);
  }, []);

  /**
   * Lối ra thứ hai cho trạng thái "không khớp gì": một mức mastery KHÁC vẫn còn khái niệm.
   * Lọc "Yếu" trên một môn đã ôn xong là tin tốt chứ không phải lỗi — nên chỗ đó phải chỉ
   * được đi đâu tiếp, thay vì chỉ có nút xóa bộ lọc.
   */
  const suggestedBand = useMemo(() => {
    if (trimmedQuery || filterRemediating || filterBand === 'all') return null;
    return BAND_ORDER.find((b) => b !== filterBand && bandCounts[b] > 0) ?? null;
  }, [trimmedQuery, filterRemediating, filterBand, bandCounts]);

  // UC-17 [E1]: > 50 node — mặc định chỉ vẽ node yếu + tiên quyết trực tiếp của chúng.
  const isLargeGraph = mode === 'view' && initialConcepts.length > LARGE_GRAPH_THRESHOLD;

  const largeGraphSubset = useMemo(() => {
    if (!isLargeGraph) return null;
    const weakIds = new Set(
      nodes
        .filter((n) => masteryBand((n.data.mastery as number | null) ?? null) === 'weak')
        .map((n) => n.id)
    );
    const result = new Set(weakIds);
    edges.forEach((e) => {
      if (weakIds.has(e.target)) result.add(e.source);
    });
    return result;
  }, [isLargeGraph, nodes, edges]);

  const dependentCounts = useMemo(() => {
    const map = new Map<string, number>();
    edges.forEach((e) => map.set(e.source, (map.get(e.source) ?? 0) + 1));
    return map;
  }, [edges]);

  // Khái niệm gốc (không có tiên quyết) — điểm bắt đầu tự nhiên khi chưa đo được gì (UC-17 [E2]).
  const rootConceptIds = useMemo(() => {
    if (!allUntested) return [];
    const withPrereq = new Set(edges.map((e) => e.target));
    return nodes.filter((n) => !withPrereq.has(n.id)).map((n) => n.id);
  }, [allUntested, nodes, edges]);

  const showLargeGraphSubset = isLargeGraph && !showAllNodes && largeGraphSubset !== null;

  const displayNodes = useMemo(() => {
    const base = showLargeGraphSubset ? nodes.filter((n) => largeGraphSubset!.has(n.id)) : nodes;
    return base.map((n) => {
      const dimmed = hasActiveFilter && !matchedNodeIds.has(n.id);
      return {
        ...n,
        data: { ...n.data, dependentCount: dependentCounts.get(n.id) ?? 0, mode },
        className: dimmed ? 'is-dimmed' : undefined,
      };
    });
  }, [
    showLargeGraphSubset,
    nodes,
    largeGraphSubset,
    hasActiveFilter,
    matchedNodeIds,
    dependentCounts,
    mode,
  ]);

  const displayEdges = useMemo(() => {
    const base = showLargeGraphSubset
      ? edges.filter((e) => largeGraphSubset!.has(e.source) && largeGraphSubset!.has(e.target))
      : edges;
    return base.map((e) => {
      const dimmed =
        hasActiveFilter && (!matchedNodeIds.has(e.source) || !matchedNodeIds.has(e.target));
      let relClass = '';
      if (
        mode === 'view' &&
        selectedNodeId &&
        (e.source === selectedNodeId || e.target === selectedNodeId)
      ) {
        const isPrereqEdge = e.target === selectedNodeId;
        const sourceBand = masteryBand(
          (nodeById.get(e.source)?.data.mastery as number | null) ?? null
        );
        relClass =
          isPrereqEdge && sourceBand === 'weak'
            ? 'react-flow__edge--prerequisite-weak'
            : 'react-flow__edge--related';
      }
      return {
        ...e,
        className: [e.className, dimmed ? 'is-dimmed' : '', relClass].filter(Boolean).join(' '),
      };
    });
  }, [
    showLargeGraphSubset,
    edges,
    largeGraphSubset,
    hasActiveFilter,
    matchedNodeIds,
    mode,
    selectedNodeId,
    nodeById,
  ]);

  // Initialize and Layout
  useEffect(() => {
    const rfNodes = toReactFlowNodes(initialConcepts);
    const rfEdges = toReactFlowEdges(initialEdges);

    // Apply dagre layout (LR direction)
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      rfNodes,
      rfEdges,
      'LR',
      nodeWidth
    );

    setNodes(layoutedNodes as Node[]);
    setEdges(layoutedEdges);
  }, [initialConcepts, initialEdges, nodeWidth, setNodes, setEdges]);

  // Fit view to show entire graph when side panel toggles hoặc khi bật/tắt "Hiện toàn bộ"
  useEffect(() => {
    if (rfInstance && nodes.length > 0) {
      // Wait briefly for the side panel to render and CSS flex layout to resize
      setTimeout(() => {
        rfInstance.fitView({ duration: 600, padding: 0.2 });
      }, 50);
    }
  }, [selectedNodeId, rfInstance, nodes.length, showAllNodes]);

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
      setIsDirty(true);
    },
    [mode, edges, nodes, setEdges]
  );

  // Auto Layout action
  const onLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      'LR',
      nodeWidth
    );
    setNodes(layoutedNodes as Node[]);
    setEdges(layoutedEdges);
  }, [nodes, edges, nodeWidth, setNodes, setEdges]);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setIsUpdating(true);
    try {
      const concepts: Concept[] = nodes.map((n) => ({
        id: n.id,
        name: n.data.label as string,
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
      setIsDirty(true);
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
      // `source: 'manual'` khớp thứ server sẽ ghi khi lưu node này (graph.service tạo concept
      // mới với `source: 'manual'`), nên câu chữ trước và sau khi lưu là một.
      data: { label: name, mastery: null, source: 'manual' },
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
    };

    setNodes((nds) => [...nds, newNode]);
    setNewConceptName('');
    setIsAddDialogOpen(false);
    setIsDirty(true);
    toast.success(`Đã thêm khái niệm "${name}".`);
  }, [newConceptName, nodes, setNodes]);

  // Đóng panel = bỏ chọn thật sự: react-flow giữ cờ `selected` trong state node của chính nó,
  // nên chỉ setSelectedNodeId(null) sẽ đóng panel nhưng để lại vòng chọn trên canvas (và lần
  // sau bấm đúng node đó có thể không phát onSelectionChange). Gỡ luôn cờ trên nodes.
  const handleDeselectNode = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelectedNodeId(null);
  }, [setNodes]);

  // --- DELETE NODE ---
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      // Also remove all edges connected to this node
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
      setIsDirty(true);
      toast.info('Đã xóa khái niệm.');
    },
    [setNodes, setEdges]
  );

  const hasSidePanel = Boolean(selectedNode);

  // Đang lọc thì bộ đếm phải nói về kết quả lọc — kể cả khi đồ thị chưa có dữ liệu mastery,
  // vì lúc đó người dùng vẫn tìm được theo tên.
  const countLabel = hasActiveFilter
    ? `${filterBand !== 'all' ? `${masteryLabel(filterBand)} · ` : ''}${matchedNodeIds.size} / ${initialConcepts.length} khái niệm`
    : allUntested
      ? `${initialConcepts.length} khái niệm · chưa có dữ liệu mastery`
      : `${initialConcepts.length} khái niệm · ${weakCount} yếu · ${untestedCount} chưa kiểm tra`;

  return (
    <div className="min-h-150 flex h-full w-full flex-col">
      {/*
        Thanh công cụ là một khối riêng phía trên vùng làm việc: bo góc trên, bỏ viền dưới
        để nó và canvas đọc như một khối liền (mockup .toolbar + .workspace).
      */}
      <div className="border-border bg-card overflow-hidden rounded-t-[calc(var(--radius)*1.35)] border border-b-0">
        {/* UC-17 [E1]: cảnh báo + lối giải quyết cho đồ thị lớn. Đứng TRÊN thanh công cụ vì
            nó nói về phạm vi đang vẽ, không phải về một bộ lọc trong đó. */}
        {showLargeGraphSubset && (
          <div className="bg-mastery-learning/7 border-border px-4.5 flex flex-wrap items-center gap-3 border-b py-3 text-[12.5px]">
            <span>
              <strong className="font-semibold">{initialConcepts.length} khái niệm</strong> — đang
              hiển thị {largeGraphSubset?.size ?? 0} khái niệm chưa vững và tiên quyết trực tiếp của
              chúng.
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto h-7 shrink-0 text-xs"
              onClick={() => setShowAllNodes(true)}
            >
              Hiện toàn bộ {initialConcepts.length} node
            </Button>
          </div>
        )}

        {mode === 'edit' && (
          <div className="px-4.5 text-muted-foreground flex items-center justify-between gap-3 py-3 text-[12px]">
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
            </div>
          </div>
        )}

        {/* DB-05: thanh công cụ lọc & tìm kiếm */}
        {mode === 'view' && (
          <div className="px-4.5 flex flex-wrap items-center gap-2.5 py-3.5">
            <div className="relative w-60 shrink-0">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-muted-foreground left-2.75 pointer-events-none absolute top-1/2 -translate-y-1/2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.6-3.6" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm khái niệm theo tên..."
                aria-label="Tìm khái niệm"
                className="border-border bg-background text-foreground focus-visible:ring-ring py-2.25 pl-8.5 w-full rounded-[calc(var(--radius)*0.7)] border pr-3 text-[13px] outline-none focus-visible:ring-2"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                active={filterBand === 'all'}
                disabled={allUntested}
                onClick={() => setFilterBand('all')}
              >
                Tất cả
              </FilterChip>
              {BAND_ORDER.map((band) => (
                <FilterChip
                  key={band}
                  active={filterBand === band}
                  disabled={allUntested}
                  color={BAND_COLOR_VAR[band]}
                  onClick={() => setFilterBand(band)}
                >
                  {masteryLabel(band)}
                </FilterChip>
              ))}
              {/* "Đang ôn lại" đứng sau vạch ngăn — không cùng trục với 4 mức mastery ở trên:
                  bốn cái đó loại trừ nhau, cái này chồng lên bất kỳ cái nào. */}
              <span className="bg-border mx-0.5 h-5 w-px shrink-0" />
              <FilterChip
                active={filterRemediating}
                color="var(--remediate)"
                onClick={() => setFilterRemediating((v) => !v)}
              >
                Đang ôn lại
              </FilterChip>
            </div>
            <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[12px] tabular-nums">
              {countLabel}
            </span>
          </div>
        )}
      </div>

      <div
        className={cn(
          'border-border bg-card relative grid min-h-0 flex-1 overflow-hidden rounded-b-[calc(var(--radius)*1.35)] border',
          hasSidePanel && 'lg:grid-cols-[minmax(0,1fr)_320px]'
        )}
      >
        <div
          className={cn(
            'graph-canvas bg-muted relative flex min-w-0 flex-col',
            mode === 'view' ? 'graph-canvas--view' : 'graph-canvas--edit',
            hasSidePanel && 'lg:border-border lg:border-r'
          )}
        >
          <div className="relative flex-1">
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              // Luôn nối onNodesChange/onEdgesChange — react-flow báo kích thước node đo được
              // (dimension change) qua chính handler này; không nối ở view mode khiến node
              // không bao giờ có `measured.width/height`, và cạnh (tính theo tâm handle) sụp
              // về một điểm ngoài khung nhìn. Kéo/nối/xoá vẫn chỉ bật ở edit mode, qua
              // nodesDraggable/nodesConnectable/deleteKeyCode bên dưới, không qua đây.
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
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
              elementsSelectable
              deleteKeyCode={mode === 'edit' ? ['Backspace', 'Delete'] : null}
              proOptions={{ hideAttribution: true }}
              fitView
            >
              {/* Chú giải cạnh luôn hiện ở view mode: đồ thị có ba kiểu cạnh và không kiểu nào
                  tự giải thích được, kể cả khi chưa chọn node nào. */}
              {mode === 'view' && <EdgeLegend />}
              <ViewportControls />
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

            {/* DB-02 Alt flow 1: lọc/tìm kiếm không khớp gì — làm mờ toàn bộ + lối ra. Lọc
                "Yếu" trên một môn đã ôn xong sẽ rơi vào đây, và đó là TIN TỐT: câu chữ nói
                đúng điều đó thay vì báo lỗi. */}
            {noMatches && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 px-6 text-center">
                <p className="text-[14px] font-semibold">
                  {suggestedBand
                    ? `Không có khái niệm nào ở mức ${masteryLabel(filterBand as MasteryBand).toLowerCase()}`
                    : 'Không có khái niệm nào khớp'}
                </p>
                <p className="text-muted-foreground max-w-105 text-pretty text-[12.5px] leading-[1.65]">
                  {suggestedBand
                    ? `Cả ${initialConcepts.length} khái niệm của kế hoạch này đều nằm ngoài mức đó. Bỏ bộ lọc để xem toàn bộ đồ thị, hoặc lọc "${masteryLabel(suggestedBand)}" để thấy ${bandCounts[suggestedBand]} khái niệm.`
                    : 'Không có khái niệm nào khớp với bộ lọc hiện tại. Xóa bộ lọc để xem lại toàn bộ đồ thị.'}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Xóa bộ lọc
                  </Button>
                  {suggestedBand && (
                    <Button variant="ghost" size="sm" onClick={() => setFilterBand(suggestedBand)}>
                      Lọc "{masteryLabel(suggestedBand)}"
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* UC-17 [E2]: chưa có phiên kiểm tra nào — gợi ý điểm bắt đầu tự nhiên */}
            {mode === 'view' && allUntested && rootConceptIds.length > 0 && (
              <div className="border-border bg-card/95 shadow-soft absolute right-6 top-6 z-10 w-60 rounded-[calc(var(--radius)*0.9)] border p-4 backdrop-blur-sm">
                <p className="mb-1.5 text-[13px] font-semibold">Chưa đo được gì</p>
                <p className="text-muted-foreground mb-3 text-pretty text-[12px] leading-[1.65]">
                  Đồ thị đã dựng xong nhưng chưa biết bạn vững ở đâu. {rootConceptIds.length} khái
                  niệm không có tiên quyết nào là điểm bắt đầu tự nhiên.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    navigate(`/interview?planId=${planId}&conceptIds=${rootConceptIds.join(',')}`)
                  }
                >
                  Kiểm tra {rootConceptIds.length} khái niệm gốc
                </Button>
              </div>
            )}
          </div>
        </div>

        {mode === 'edit' && selectedNode && (
          <aside className="w-70 border-border bg-card absolute bottom-0 right-0 top-0 z-10 flex shrink-0 flex-col gap-4 overflow-y-auto border-l p-[18px_18px_20px] shadow-lg lg:static lg:w-80 lg:border-none lg:shadow-none">
            <div>
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <p className="text-muted-foreground mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.07em]">
                  Khái niệm đang chọn
                </p>
                <button
                  type="button"
                  aria-label="Bỏ chọn khái niệm"
                  onClick={handleDeselectNode}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground -mr-1 -mt-1 shrink-0 rounded-md p-1 text-lg leading-none transition-colors"
                >
                  ×
                </button>
              </div>
              <h2 className="font-heading mb-2 text-[19px] leading-tight tracking-[-0.015em]">
                {selectedNode.data.label as string}
              </h2>
              {(() => {
                // Khái niệm tự thêm: `difficulty` là mặc định của server (1), không ai ước
                // lượng nó — vẽ thang 5 vạch kèm chữ "AI ước lượng" ở đây là gán cho AI một
                // phán đoán nó chưa từng đưa ra. Nói đúng nguồn gốc node và bỏ con số đi.
                if (selectedNode.data.source === 'manual') {
                  return (
                    <p className="text-muted-foreground text-[12px]">
                      Bạn tự thêm khái niệm này — chưa có ước lượng độ khó.
                    </p>
                  );
                }
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
              {/* Cổng xác nhận C5: người dùng chỉ "xác nhận" được sau khi đối chiếu tên khái
                  niệm với đúng câu trong tài liệu — nên panel này phải hiện trích đoạn THẬT,
                  cùng khối dùng chung với panel view mode (Issue #202). Remount theo id để
                  state fetch khởi tạo đúng cho từng khái niệm. */}
              <div className="mb-3">
                <ConceptSourcesSection
                  key={selectedNode.id}
                  planId={planId}
                  conceptId={selectedNode.id}
                  conceptName={selectedNode.data.label as string}
                  prerequisiteNames={prerequisites.map((p) => p.sourceName)}
                />
              </div>
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

        {/* DB-06: panel chi tiết — chỉ ở view mode, thay cho aside rút gọn của edit mode */}
        {mode === 'view' && selectedNode && (
          <ConceptDetailPanel
            // Remount per concept — its internal fetch state (`isLoading`/`hasError`/`detail`)
            // then starts fresh by construction, no reset-on-prop-change effect needed.
            key={selectedNode.id}
            planId={planId}
            conceptId={selectedNode.id}
            conceptName={selectedNode.data.label as string}
            prerequisites={prerequisitesForDetail}
            dependents={dependentsForDetail}
            onClose={handleDeselectNode}
          />
        )}
      </div>

      {/* COMMIT SECTION */}
      {mode === 'edit' && (
        <div className="mt-4.5 flex flex-wrap items-center gap-3.5">
          <Button onClick={handleConfirm} disabled={isUpdating}>
            {isUpdating ? 'Đang lưu...' : confirmLabel}
          </Button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-[13.5px] font-medium underline underline-offset-4 transition-colors"
            onClick={handleCancelClick}
          >
            Hủy
          </button>
          {isDraft && (
            <p className="text-muted-foreground m-0 min-w-0 flex-1 basis-80 text-pretty text-[12.5px] leading-[1.6]">
              Khi xác nhận, kế hoạch bắt đầu và hệ thống tự sắp lịch ôn cho bạn. Điểm thành thạo sẽ
              được tính sau buổi kiểm tra đầu tiên.
            </p>
          )}
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="sm:max-w-110">
          <DialogHeader>
            <DialogTitle className="text-lg">Hủy bỏ thay đổi?</DialogTitle>
            <DialogDescription className="text-[14px]">
              Bạn có những thay đổi chưa được lưu trên đồ thị. Những thay đổi này sẽ bị mất nếu bạn
              tiếp tục hủy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
              Tiếp tục chỉnh sửa
            </Button>
            <Button variant="destructive" onClick={confirmCancel}>
              Đồng ý hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
