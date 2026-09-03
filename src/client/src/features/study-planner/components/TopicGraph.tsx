import { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Panel,
  Handle,
  Position,
  MarkerType,
  Edge,
  Node,
  NodeProps,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { masteryBand, masteryLabel } from '@/components/ui/concept-node';
import { cn } from '@/lib/utils';
import { getLayoutedElements } from '../utils/graphTransform';
import { TopicSummary, UNASSIGNED_TOPIC_ID } from '../utils/topicAggregate';
import { PlanDocumentEdge } from '../types/concept';
import { ViewportControls } from './ConceptGraph';

/** Rộng hơn node khái niệm (174) vì node chủ đề mang ba dòng chứ không phải một. */
const NODE_WIDTH_TOPIC = 232;

/**
 * Màu dải mastery, theo đúng token của tầng khái niệm.
 *
 * Viết thành literal đầy đủ chứ không ghép chuỗi: bộ quét của Tailwind đọc mã nguồn theo văn
 * bản, nên `bg-mastery-${band}` không sinh ra lớp nào và dải sẽ trong suốt — hỏng im lặng.
 */
const BAND_BAR_CLASS: Record<string, string> = {
  strong: 'bg-mastery-strong',
  learning: 'bg-mastery-learning',
  weak: 'bg-mastery-weak',
  untested: 'bg-muted',
};

interface TopicNodeData extends Record<string, unknown> {
  topic: TopicSummary;
}

/**
 * Node chủ đề — CĂN TRÁI và nhiều dòng, cố ý khác node khái niệm (căn giữa, một dòng), để nhìn
 * là biết đang ở tầng nào mà không phải đọc breadcrumb.
 */
function TopicNode({ data, selected }: NodeProps<Node<TopicNodeData>>) {
  const { topic } = data;
  const band = masteryBand(topic.averageMastery);
  const isUnassigned = topic.id === UNASSIGNED_TOPIC_ID;

  return (
    <div
      className={cn(
        'border-border bg-card w-[232px] rounded-[calc(var(--radius)*0.8)] border px-3 py-2.5 text-left transition-shadow',
        selected && 'ring-primary/40 ring-2',
        isUnassigned && 'border-dashed'
      )}
      data-topic-id={topic.id}
      data-band={band}
    >
      {/* Anchors for the edges. Invisible on purpose: on the first and last topic a visible
          handle reads as an arrow going nowhere, which on a screen whose whole subject is
          "which topic comes next" is an outright misstatement. */}
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div className="truncate text-[13.5px] font-medium" title={topic.label}>
        {topic.label}
      </div>
      <div className="text-muted-foreground mt-1 font-mono text-[11px]">
        {topic.pageCount !== null && <span>{topic.pageCount} trang · </span>}
        <span>{topic.conceptCount} khái niệm</span>
        {topic.weakCount > 0 && <span> · {topic.weakCount} yếu</span>}
      </div>
      {/* Dải mastery dùng ĐÚNG token màu của tầng khái niệm, nhưng KHÔNG dùng lớp
          `.concept-node--*`: lớp đó kèm `border-style: dashed` cho ô chưa kiểm tra, mà nét đứt
          từ nay có đúng một nghĩa trong cả sản phẩm — "AI suy, cần soát". Mượn nó ở đây làm dải
          mastery trông như một ô nhập liệu rỗng, và tệ hơn, nói sai. */}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={cn('h-1.5 flex-1 rounded-full', BAND_BAR_CLASS[band])}
          aria-hidden="true"
        />
        <span className="text-muted-foreground text-[10.5px]">
          {topic.averageMastery === null ? masteryLabel('untested') : masteryLabel(band)}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

/**
 * Chú giải của tầng chủ đề. MỘT mục, vì tầng này chỉ có một kiểu cạnh.
 *
 * Nét đứt từ nay có ĐÚNG MỘT nghĩa trong cả sản phẩm — "AI suy khi nối các tệp, cần soát" — và
 * chỉ xuất hiện ở đây. Bản trước dùng cùng nét đứt cho hai nghĩa ở hai màn, và chính sự trùng
 * hình đó làm người xem đọc mockup thành "vẫn còn nối khái niệm giữa các chủ đề".
 */
function TopicEdgeLegend() {
  return (
    <Panel
      position="top-left"
      className="border-border bg-card/95 text-muted-foreground shadow-(--shadow-soft) m-4! flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] backdrop-blur-sm"
    >
      <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
        <line
          x1="1"
          y1="4"
          x2="20"
          y2="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path d="M20 1.5 L25 4 L20 6.5 Z" fill="currentColor" />
      </svg>
      <span>Thứ tự nên học — AI suy từ mô tả khái niệm, hãy soát lại</span>
    </Panel>
  );
}

interface TopicGraphProps {
  topics: TopicSummary[];
  documentEdges: PlanDocumentEdge[];
  onOpenTopic: (topicId: string) => void;
}

/**
 * Tầng 1 của đồ thị: mỗi tài liệu một ô, bấm vào để xuống đồ thị khái niệm của nó.
 *
 * MỌI cạnh ở đây đều nét đứt, không có ngoại lệ để trừ ra: pha 1 chỉ nhìn một tệp nên về nguyên
 * tắc không thể sinh cạnh giữa hai tệp, tức 100% hàng `document_edges` là AI suy. Tính chất đó
 * là của cả bảng, nên nó được vẽ chứ không cần một cột `source` để tra từng hàng.
 */
export function TopicGraph({ topics, documentEdges, onOpenTopic }: TopicGraphProps) {
  const nodeTypes = useMemo(() => ({ topicNode: TopicNode }), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const topicIds = new Set(topics.map((t) => t.id));
    const rawNodes: Node[] = topics.map((topic) => ({
      id: topic.id,
      type: 'topicNode',
      data: { topic },
      position: { x: 0, y: 0 },
    }));
    const rawEdges = documentEdges
      .filter((e) => topicIds.has(e.fromDocumentId) && topicIds.has(e.toDocumentId))
      .map((e) => ({
        id: e.id,
        source: e.fromDocumentId,
        target: e.toDocumentId,
        type: 'straight',
        className: 'concept-edge',
        style: { strokeWidth: 1.5, strokeDasharray: '5 4' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: 'var(--mastery-untested)',
        },
      }));

    const layouted = getLayoutedElements(rawNodes, rawEdges, 'LR', NODE_WIDTH_TOPIC);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [topics, documentEdges, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) => onOpenTopic(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      {documentEdges.length > 0 && <TopicEdgeLegend />}
      <ViewportControls />
    </ReactFlow>
  );
}
