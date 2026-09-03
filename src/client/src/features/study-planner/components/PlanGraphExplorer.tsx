import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Concept, ConceptEdge, PlanDocument, PlanDocumentEdge } from '../types/concept';
import {
  UNASSIGNED_TOPIC_ID,
  conceptsOfTopic,
  mergeTopicEditIntoGraph,
  splitEdgesByTopic,
  summariseTopics,
} from '../utils/topicAggregate';
import { ConceptGraph } from './ConceptGraph';
import { TopicGraph } from './TopicGraph';

interface PlanGraphExplorerProps {
  planId: string;
  documents: PlanDocument[];
  documentEdges: PlanDocumentEdge[];
  concepts: Concept[];
  edges: ConceptEdge[];
  mode: 'view' | 'edit';
  /**
   * `documentEdges` is passed ONLY when the student removed a topic arrow. Absent means "leave
   * the topic layer alone", which is exactly what the server does with a missing field — the
   * live DAG re-check must not be able to wipe the study order between documents.
   */
  onConfirm?: (
    concepts: Concept[],
    edges: ConceptEdge[],
    documentEdges?: { from: string; to: string }[]
  ) => Promise<void>;
  confirmLabel?: string;
  onCancel?: () => void;
  isDraft?: boolean;
}

/**
 * Đồ thị HAI TẦNG: tầng chủ đề (một tệp = một ô) -> bấm một ô -> đồ thị khái niệm của tệp đó.
 *
 * Container này SỞ HỮU đồ thị đầy đủ; `ConceptGraph` chỉ MƯỢN một lát. Nhờ vậy `ConceptGraph`
 * không phải biết gì về chủ đề — nó vẫn nhận đúng hai prop `initialConcepts`/`initialEdges` như
 * trước, nên bốn test hồi quy #205 xanh theo CẤU TRÚC chứ không theo may mắn.
 */
export function PlanGraphExplorer({
  planId,
  documents,
  documentEdges,
  concepts,
  edges,
  mode,
  onConfirm,
  confirmLabel,
  onCancel,
  isDraft = false,
}: PlanGraphExplorerProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Topic arrows the student struck out while reviewing, by edge id.
   *
   * Local and un-persisted until confirm, matching how the concept graph behaves: the review
   * step is a proposal being checked, and nothing is written until the student says so.
   */
  const [removedEdgeIds, setRemovedEdgeIds] = useState<ReadonlySet<string>>(new Set());
  const visibleDocumentEdges = useMemo(
    () => documentEdges.filter((edge) => !removedEdgeIds.has(edge.id)),
    [documentEdges, removedEdgeIds]
  );
  /** `undefined` until something was actually removed — see the prop's docstring. */
  const topicEdgePayload = useMemo(
    () =>
      removedEdgeIds.size === 0
        ? undefined
        : visibleDocumentEdges.map((edge) => ({
            from: edge.fromDocumentId,
            to: edge.toDocumentId,
          })),
    [removedEdgeIds, visibleDocumentEdges]
  );
  const removeTopicEdge = useCallback((edgeId: string) => {
    setRemovedEdgeIds((current) => new Set(current).add(edgeId));
  }, []);

  const topics = useMemo(() => summariseTopics(documents, concepts), [documents, concepts]);

  const requestedTopicId = searchParams.get('topic');
  // `?topic=` trỏ tới thứ không tồn tại thì coi như chưa chọn gì. Không `setSearchParams` trong
  // một effect để "dọn" URL: việc đó ghi lịch sử ngay trong lượt render đầu và nút Back của
  // trình duyệt — thứ cả tính năng này dựa vào để quay lên tầng trên — bắt đầu nhảy cóc.
  const openTopicId = topics.some((t) => t.id === requestedTopicId) ? requestedTopicId : null;
  const openTopic = topics.find((t) => t.id === openTopicId) ?? null;

  const openTopic$ = useCallback(
    (topicId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('topic', topicId);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const closeTopic = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('topic');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  // --- lát đang mở -------------------------------------------------------------------------
  const subsetConcepts = useMemo(
    () => (openTopicId ? conceptsOfTopic(concepts, openTopicId, documents) : []),
    [concepts, openTopicId, documents]
  );
  const subsetIds = useMemo(() => new Set(subsetConcepts.map((c) => c.id)), [subsetConcepts]);
  const { intra: subsetEdges, cross: crossEdges } = useMemo(
    () => splitEdgesByTopic(edges, subsetIds),
    [edges, subsetIds]
  );

  /**
   * Ghép lát vừa sửa trở lại đồ thị đầy đủ trước khi gửi. Toàn bộ luật ghép nằm trong
   * `mergeTopicEditIntoGraph`, một hàm thuần có bộ test riêng — đây là chỗ dễ mất dữ liệu nhất
   * của cả tính năng, và nó cần được đo bằng những ca mà thao tác trên UI khó dựng cho hết.
   */
  const handleTopicConfirm = useCallback(
    async (editedConcepts: Concept[], editedEdges: ConceptEdge[]) => {
      if (!onConfirm) return;
      const merged = mergeTopicEditIntoGraph({
        fullConcepts: concepts,
        fullEdges: edges,
        slice: subsetConcepts,
        editedConcepts,
        editedEdges,
        openTopicId: openTopicId === UNASSIGNED_TOPIC_ID ? null : openTopicId,
      });
      await onConfirm(merged.concepts, merged.edges, topicEdgePayload);
    },
    [concepts, edges, subsetConcepts, openTopicId, onConfirm, topicEdgePayload]
  );

  // --- degrade -----------------------------------------------------------------------------
  // Điều kiện là `documents.length`, KHÔNG phải `documentEdges.length`: một kế hoạch 3 tệp mà
  // lượt nối trả rỗng vẫn phải hiện 3 ô chủ đề rời (đúng sự thật: "chưa biết thứ tự"), chứ không
  // được rơi về đồ thị phẳng và giấu mất việc có 3 tệp.
  //
  // `<= 1` chứ không `=== 1`: kế hoạch 0 tài liệu là đường có thật (DB dev có một cái).
  if (documents.length <= 1) {
    return (
      <ConceptGraph
        planId={planId}
        initialConcepts={concepts}
        initialEdges={edges}
        mode={mode}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
        onCancel={onCancel}
        isDraft={isDraft}
      />
    );
  }

  // --- tầng 2: khái niệm trong một chủ đề ----------------------------------------------------
  if (openTopic) {
    return (
      <div className="flex h-full w-full flex-col">
        <TopicBreadcrumb topicLabelText={openTopic.label} onBack={closeTopic} />
        {crossEdges.length > 0 && <CrossEdgeNotice count={crossEdges.length} onBack={closeTopic} />}
        <div className="min-h-0 flex-1">
          <ConceptGraph
            // `key` buộc React dựng lại khi đổi chủ đề. `ConceptGraph` chép prop vào state nội
            // bộ ở lần mount đầu, nên không có dòng này thì đổi chủ đề vẫn hiện đồ thị cũ.
            key={openTopic.id}
            planId={planId}
            initialConcepts={subsetConcepts}
            initialEdges={subsetEdges}
            mode={mode}
            onConfirm={onConfirm ? handleTopicConfirm : undefined}
            confirmLabel={confirmLabel}
            onCancel={onCancel}
            isDraft={isDraft}
          />
        </div>
      </div>
    );
  }

  // --- tầng 1: chủ đề ------------------------------------------------------------------------
  return (
    <div className="border-border bg-card relative flex h-full w-full flex-col overflow-hidden rounded-xl border">
      <div className="border-border text-muted-foreground flex flex-none items-center justify-between gap-4 border-b px-4 py-2.5 text-[12.5px]">
        <span>
          <span className="text-foreground font-medium">{documents.length} chủ đề</span> ·{' '}
          {concepts.length} khái niệm
        </span>
        <span className="font-mono text-[11.5px]">Bấm một chủ đề để xem khái niệm bên trong</span>
      </div>

      {mode === 'edit' && <TopicReviewStrip count={visibleDocumentEdges.length} />}
      {mode === 'edit' && visibleDocumentEdges.length > 0 && (
        <TopicEdgeReviewList
          edges={visibleDocumentEdges}
          topics={topics}
          onRemove={removeTopicEdge}
        />
      )}

      <div className="min-h-0 flex-1">
        <TopicGraph topics={topics} documentEdges={visibleDocumentEdges} onOpenTopic={openTopic$} />
      </div>

      {mode === 'edit' && onConfirm && (
        <div className="border-border flex flex-none items-center justify-end gap-2 border-t px-4 py-3">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Hủy
            </Button>
          )}
          <Button size="sm" onClick={() => void onConfirm(concepts, edges, topicEdgePayload)}>
            {confirmLabel ?? 'Xác nhận & Bắt đầu'}
          </Button>
        </div>
      )}
    </div>
  );
}

function TopicBreadcrumb({
  topicLabelText,
  onBack,
}: {
  topicLabelText: string;
  onBack: () => void;
}) {
  return (
    <div className="text-muted-foreground mb-2 flex flex-none items-center gap-2 text-[13px]">
      <button
        type="button"
        onClick={onBack}
        className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
      >
        ← Tất cả chủ đề
      </button>
      <span aria-hidden="true">›</span>
      <span className="text-foreground truncate font-medium">{topicLabelText}</span>
    </div>
  );
}

/**
 * Trả nợ cho việc ẩn cạnh xuyên chủ đề. KHÔNG phải trang trí.
 *
 * `ConceptDetailPanel` tính tiên quyết từ chính đồ thị được truyền vào, nên một khái niệm có tiên
 * quyết ở chủ đề khác sẽ hiện ra như thể "không có tiên quyết nào" và người học TIN. Bỏ dải này
 * đi thì đây thành đúng lớp lỗi "rỗng đọc thành xanh".
 *
 * `count === 0` là ca thường (pha 1 chỉ nối khái niệm trong cùng một tệp), nên dải VẮNG MẶT hẳn
 * thay vì hiện "0 quan hệ".
 */
function CrossEdgeNotice({ count, onBack }: { count: number; onBack: () => void }) {
  return (
    <div
      data-testid="cross-edge-notice"
      className="border-border bg-muted/40 text-muted-foreground mb-2 flex flex-none items-center gap-2 rounded-md border px-3 py-2 text-[12.5px]"
    >
      <span>
        <span className="text-foreground font-medium">{count}</span> quan hệ tiên quyết của các khái
        niệm này nối sang chủ đề khác — không vẽ ở đây để đồ thị chỉ còn một chủ đề.
      </span>
      <button
        type="button"
        onClick={onBack}
        className="text-primary whitespace-nowrap hover:underline"
      >
        Xem ở đồ thị chủ đề
      </button>
    </div>
  );
}

/** Bước kiểm chứng nói thẳng cạnh tầng chủ đề đến từ đâu, trước khi người dùng xác nhận. */
function TopicReviewStrip({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div
        data-testid="topic-review-strip"
        className="border-border text-muted-foreground flex-none border-b px-4 py-2 text-[12.5px]"
      >
        Chưa xếp được thứ tự học giữa các chủ đề — các chủ đề hiện rời nhau. Bạn vẫn xác nhận và bắt
        đầu ôn tập được.
      </div>
    );
  }
  return (
    <div
      data-testid="topic-review-strip"
      className="border-border bg-muted/40 text-muted-foreground flex-none border-b px-4 py-2 text-[12.5px]"
    >
      <span className="text-foreground font-medium">{count}</span> quan hệ nối giữa các chủ đề được
      suy từ mô tả khái niệm, không phải đọc thẳng tài liệu — vẽ bằng nét đứt, hãy soát lại trước
      khi xác nhận.
    </div>
  );
}

/**
 * The review surface the dashed arrows were always promised.
 *
 * `TopicReviewStrip` right above says "hãy soát lại trước khi xác nhận" — until now there was
 * nothing to soát WITH: a thin dashed line on a canvas is hard to read as a claim and impossible
 * to act on. Each AI-inferred study order gets one row and one way out.
 *
 * Deliberately a list rather than an affordance on the edge itself. React Flow deletes edges via
 * `deleteKeyCode`, which means discovering it requires already knowing it, and it cannot be
 * driven in jsdom — so the one control that prevents a wrong arrow from being confirmed would be
 * both undiscoverable and untested.
 */
function TopicEdgeReviewList({
  edges,
  topics,
  onRemove,
}: {
  edges: PlanDocumentEdge[];
  topics: { id: string; label: string }[];
  onRemove: (edgeId: string) => void;
}) {
  const labelOf = (documentId: string) =>
    topics.find((topic) => topic.id === documentId)?.label ?? 'Chủ đề đã bị xoá';

  return (
    <ul
      data-testid="topic-edge-review-list"
      className="border-border flex flex-none flex-wrap gap-1.5 border-b px-4 py-2.5"
    >
      {edges.map((edge) => (
        <li
          key={edge.id}
          className="border-border bg-background text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]"
        >
          <span>
            <span className="text-foreground">{labelOf(edge.fromDocumentId)}</span>
            {' → '}
            <span className="text-foreground">{labelOf(edge.toDocumentId)}</span>
          </span>
          <button
            type="button"
            aria-label={`Bỏ thứ tự ${labelOf(edge.fromDocumentId)} trước ${labelOf(edge.toDocumentId)}`}
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => onRemove(edge.id)}
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
