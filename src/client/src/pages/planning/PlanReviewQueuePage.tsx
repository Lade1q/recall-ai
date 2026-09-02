import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { PlanStatus } from '@/features/study-planner/types/concept';
import { REVIEW_QUEUE_MAX_LIMIT } from '@/features/review-queue/api/review-queue.api';
import { AllRemovedState } from '@/features/review-queue/components/AllRemovedState';
import { EmptyQueueMessage } from '@/features/review-queue/components/EmptyQueueMessage';
import { RemovedGroup } from '@/features/review-queue/components/RemovedGroup';
import { ReviewQueueItemRow } from '@/features/review-queue/components/ReviewQueueItemRow';
import { useReviewQueue } from '@/features/review-queue/hooks/useReviewQueue';
import { Heading } from '@/components/ui/heading';

/**
 * SP-07/SP-08 — Hàng đợi ôn của một kế hoạch (Issue #225).
 *
 * Màn con của "Kế hoạch ôn tập", không phải mục sidebar mới: `MainLayout.tsx` vẫn sáng mục
 * "Kế hoạch ôn tập" cho route này, breadcrumb dẫn về `/plans`.
 *
 * BA trạng thái rỗng thật trên endpoint `?planId=` (hai từ AC #225 "Gộp thêm 06/08", cái thứ ba
 * do #345 bổ sung — dòng hàng đợi không bao giờ bị xoá, nhưng **khái niệm** thì có):
 * (a) plan chưa `active` (draft/archived) — `message` đọc nguyên văn từ server.
 * (b) đã gỡ hết (`items` rỗng nhưng `skippedItems` còn) — PHẢI kiểm tra TRƯỚC (a) và BỎ QUA
 *     `message` server (backend vẫn trả câu "đã ôn hết" sai ngữ cảnh ở ca này) — bẫy quan trọng
 *     nhất của issue này.
 * (c) đồ thị rỗng (#345) — `hasActiveConcepts === false`; `EmptyQueueMessage` có khung riêng.
 *
 * ⚠️ **Thứ tự (b) trước (a) là HỢP ĐỒNG, không phải chi tiết render.** Server vẫn trả
 * `COMPLETED_PLAN_MESSAGE` cho ca (b) — *"Bạn đã ôn hết kế hoạch này"* trong khi sinh viên **gỡ**
 * hết chứ không ôn hết. Câu đó sai nhưng **chết** vì nhánh này chặn trước và bỏ qua `message`.
 * Đảo thứ tự hai nhánh là **phơi thẳng câu sai đó ra màn hình**, và nó sẽ trông y hệt một lỗi do
 * #345 đẻ ra. Giữ nó chết là một yêu cầu; sửa câu ở server thì ngoài phạm vi (#345).
 */
export default function PlanReviewQueuePage() {
  const { id } = useParams<{ id: string }>();
  const planId = id ?? '';

  const {
    items,
    skippedItems,
    message,
    noScheduleNote,
    hasActiveConcepts,
    isLoading,
    hasError,
    pendingConceptIds,
    goneConceptIds,
    remove,
    undoRemove,
    restore,
    reload,
  } = useReviewQueue(planId);

  const [plan, setPlan] = useState<{ name: string; status: PlanStatus } | null>(null);
  const [planFetchFailed, setPlanFetchFailed] = useState(false);

  // Tên kế hoạch đã đi kèm từng mục hàng đợi (`planName`, #232), nên đường thường không tốn thêm
  // request nào. Chỉ khi cả hai danh sách đều rỗng mới phải hỏi `GET /plans/:id` — và đúng lúc đó
  // ta cũng cần `status` để chọn khung cho màn rỗng. Request này kéo về cả đồ thị khái niệm nên
  // không đáng gọi chỉ để lấy một cái tên.
  const planNameFromQueue = items[0]?.planName ?? skippedItems[0]?.planName ?? null;
  const needsPlanDetails = !isLoading && !hasError && planNameFromQueue === null && planId !== '';

  useEffect(() => {
    if (!needsPlanDetails) return;
    let isMounted = true;
    planApi
      .getPlan(planId)
      .then((detail) => {
        if (isMounted) setPlan({ name: detail.name, status: detail.status });
      })
      .catch((error: unknown) => {
        console.error('Failed to load plan details', error);
        if (isMounted) setPlanFetchFailed(true);
      });
    return () => {
      isMounted = false;
    };
  }, [planId, needsPlanDetails]);

  const planName = planNameFromQueue ?? plan?.name ?? '';

  // Màn rỗng chọn tiêu đề và nút theo `plan.status`, nên hiện nó trước khi biết status sẽ nháy
  // một khung sai rồi mới đổi. Chờ nốt request kia — trừ khi nó hỏng, lúc đó khung trung tính
  // vẫn hơn là quay vòng mãi.
  const isResolvingPlan = needsPlanDetails && plan === null && !planFetchFailed;

  if (isLoading || isResolvingPlan) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  // Chỉ chặn cả trang khi KHÔNG có gì để hiện — lỗi tải lại sau một PATCH đã có toast riêng và
  // giữ nguyên dữ liệu cũ (xem `useReviewQueue`).
  if (hasError && items.length === 0 && skippedItems.length === 0) {
    return (
      <div className="border-border bg-background rounded-xl border px-7 py-6">
        <div className="max-w-140 mx-auto my-6 text-center">
          <Heading as="h2" size="section" className="mb-2">
            Không thể tải hàng đợi ôn
          </Heading>
          <p className="text-muted-foreground mb-5 text-pretty text-[13.5px] leading-[1.7]">
            Đã xảy ra lỗi khi tải danh sách. Vui lòng thử lại.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              reload().catch((error: unknown) => {
                console.error('Retry failed to load review queue', error);
              });
            }}
          >
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  // `isAllRemoved` PHẢI đứng trước — xem hợp đồng ở docstring đầu tệp. Ba ca rỗng: đã gỡ hết ·
  // plan chưa `active` · đồ thị rỗng (#345, `EmptyQueueMessage` tự chọn khung theo
  // `hasActiveConcepts`).
  const isAllRemoved = items.length === 0 && skippedItems.length > 0;
  const isEmptyQueue = items.length === 0 && !isAllRemoved;

  // `items` là gợi ý ảo (fallback A3), mọi phần tử `id = null` — không phải trạng thái rỗng, vẫn
  // có danh sách, chỉ là chưa phải lịch thật (mockup §1).
  //
  // ⚠️ Cờ này trả lời ĐÚNG MỘT câu: "danh sách đang hiện có phải gợi ý không". Từ #345 nó KHÔNG
  // còn đồng nghĩa với "kế hoạch chưa từng vấn đáp": ca (c) — đã vấn đáp, nhưng khái niệm trong
  // lịch cũ đã bị gỡ khỏi nội dung — cũng rơi vào fallback. Muốn biết có lịch sử hay không thì
  // hỏi `noScheduleNote`, đừng hỏi cờ này. Nó từng bị dùng để ẩn link "Lịch sử ôn tập" và làm
  // mất một đường đi đúng ở ca (c).
  const isFallbackSuggestion = items.length > 0 && items.every((item) => item.id === null);

  // Dòng "Vừa gỡ" đã là mục ĐÃ gỡ (PATCH chạy xong từ lúc bấm), chỉ còn nằm tại chỗ để bấm Hoàn
  // tác. Vì thế nó không được tính vào tổng — mockup `refresh()` cũng trừ `.qi--gone` khỏi cả số
  // đếm lẫn số phút, nếu không thì header nói "8 khái niệm" trong khi cột số chỉ đếm tới 07.
  const visibleItems = items.filter((item) => !goneConceptIds.has(item.conceptId));
  const visibleMinutes = visibleItems.reduce((total, item) => total + item.estimatedMinutes, 0);

  // `limit` áp cho cả hai mảng, nên chạm trần ở bất kỳ mảng nào cũng nghĩa là danh sách đang
  // thiếu. Nói ra, vì chân thẻ kế hoạch đếm thẳng từ DB và sẽ hiện một con số lớn hơn.
  const isTruncated =
    items.length >= REVIEW_QUEUE_MAX_LIMIT || skippedItems.length >= REVIEW_QUEUE_MAX_LIMIT;

  return (
    <div>
      <nav
        aria-label="Đường dẫn"
        className="text-muted-foreground mb-3.5 flex items-center gap-2 text-[12.5px]"
      >
        <Link to="/plans" className="border-border hover:text-foreground border-b">
          Kế hoạch ôn tập
        </Link>
        <span aria-hidden="true">/</span>
        <b className="text-foreground font-medium">{planName}</b>
      </nav>

      <Heading as="h1" size="page" className="mb-2 leading-[1.15]">
        Hàng đợi ôn
      </Heading>
      <p className="text-muted-foreground max-w-155 text-pretty text-sm">
        Toàn bộ khái niệm đang chờ ôn của kế hoạch này — không chỉ phần đến hạn hôm nay. Thứ tự do
        hệ thống xếp; bạn bỏ bớt hoặc đưa lại bất cứ lúc nào.
      </p>

      {isAllRemoved ? (
        <AllRemovedState
          skippedItems={skippedItems}
          pendingConceptIds={pendingConceptIds}
          onRestore={restore}
        />
      ) : isEmptyQueue ? (
        // `message` luôn khác null ở hai case thật còn có thể tới đây (draft/archived — xem
        // docs/api/review-queue.md, mục "Plan chưa ở trạng thái active"). KHÔNG hardcode câu
        // "đã ôn hết" ở client: #124 chốt server là nguồn sự thật duy nhất của mọi message, sửa
        // một chỗ. `?? ''` chỉ là sàn an toàn kiểu dữ liệu cho nhánh lý thuyết không message.
        <EmptyQueueMessage
          planId={planId}
          message={message ?? ''}
          planStatus={plan?.status ?? null}
          hasActiveConcepts={hasActiveConcepts}
        />
      ) : (
        <>
          {isFallbackSuggestion && (
            <div className="border-border bg-muted border-l-mastery-untested mt-7.5 gap-2.75 px-3.75 py-3.25 flex items-start rounded-[calc(var(--radius)*0.7)] border border-l-2">
              <Info
                aria-hidden="true"
                className="text-muted-foreground size-3.75 mt-0.5 flex-none"
              />
              <p className="text-muted-foreground text-pretty text-[13px] leading-[1.65]">
                <b className="text-foreground font-medium">
                  Đây là gợi ý, chưa phải lịch ôn của bạn.
                </b>{' '}
                {/* Cùng một banner, hai lý do khác nhau (#345). Thân câu do server cấp khi kế
                    hoạch ĐÃ vấn đáp mà lịch cũ đã mất hiệu lực; câu dưới đây là ca "chưa có kết
                    quả nào", vẫn do client giữ (ngoại lệ #273/#124). Client KHÔNG dò chuỗi để
                    biết mình ở ca nào — `noScheduleNote !== null` chính là dấu hiệu.
                    "kết quả" chứ không phải "phiên": hàng đợi chỉ sinh khi có kết quả chấm, nên
                    một phiên bỏ dở trước câu trả lời đầu tiên vẫn đúng là "chưa có kết quả". */}
                {noScheduleNote ??
                  'Kế hoạch này chưa có kết quả vấn đáp nào, nên hệ thống chưa biết bạn yếu chỗ nào. Làm một phiên là lịch thật được xếp và sửa được ngay tại đây.'}
              </p>
            </div>
          )}

          <div className="border-border mt-7.5 flex flex-wrap items-center justify-between gap-4 border-b pb-3">
            <div className="text-muted-foreground font-mono text-[12.5px]">
              <b className="text-foreground font-semibold">{visibleItems.length}</b>{' '}
              {isFallbackSuggestion ? 'gợi ý' : 'khái niệm'} · ≈{' '}
              <b className="text-foreground font-semibold">{visibleMinutes}</b> phút
            </div>
            <div className="flex items-center gap-4 text-[12.5px]">
              <Link
                to={`/plan/${planId}`}
                className="text-muted-foreground hover:text-foreground border-border border-b"
              >
                Xem trên đồ thị khái niệm
              </Link>
              {/* #345: `isFallbackSuggestion` trả lời "danh sách này có phải gợi ý không". Ở đây
                  nó từng bị dùng để trả lời "sinh viên có lịch sử ôn không" — hai câu hỏi trùng
                  nhau ở MỌI ca trừ ca (c): kế hoạch ĐÃ vấn đáp, nhưng khái niệm trong lịch cũ đã
                  bị gỡ nên danh sách rơi về gợi ý. Đúng ca đó link lịch sử biến mất — mất một
                  ĐƯỜNG ĐI, và mất im lặng. Cùng căn bệnh issue này chữa: một cờ hai câu hỏi.
                  Vá bằng `noScheduleNote`, KHÔNG đẻ cờ mới: (a) và (c) chỉ được phân biệt bằng
                  ĐÚNG MỘT dấu hiệu; thêm cái thứ hai là lại có hai nguồn sự thật cho một câu. */}
              {(!isFallbackSuggestion || noScheduleNote !== null) && (
                <Link
                  to="/history"
                  className="text-muted-foreground hover:text-foreground border-border border-b"
                >
                  Lịch sử ôn tập
                </Link>
              )}
            </div>
          </div>

          {isTruncated && (
            <p className="text-muted-foreground mt-3 text-[12.5px]">
              Kế hoạch này có nhiều hơn {REVIEW_QUEUE_MAX_LIMIT} mục — màn hình đang hiển thị{' '}
              {REVIEW_QUEUE_MAX_LIMIT} mục được xếp ưu tiên cao nhất.
            </p>
          )}

          <ol className="m-0 list-none p-0">
            {items.map((item, i) => {
              const isGone = goneConceptIds.has(item.conceptId);
              // Số thứ tự chỉ đếm các dòng thật — dòng "vừa gỡ" giữ nguyên chỗ cũ nhưng không
              // chiếm một số (mockup: CSS counter `counter-increment: none` cho `.qi--gone`).
              // Tính thuần từ vị trí trong mảng, không mutate biến ngoài trong lúc render.
              const goneBeforeCount = items
                .slice(0, i)
                .filter((it) => goneConceptIds.has(it.conceptId)).length;
              return (
                <ReviewQueueItemRow
                  key={item.conceptId}
                  item={item}
                  variant={isGone ? 'gone' : 'remove'}
                  index={isGone ? undefined : i - goneBeforeCount}
                  isPending={pendingConceptIds.has(item.conceptId)}
                  onRemove={remove}
                  onUndo={undoRemove}
                />
              );
            })}
          </ol>

          {isFallbackSuggestion ? (
            <div className="mt-5">
              <Button asChild>
                <Link to={`/interview?planId=${planId}`}>Bắt đầu phiên vấn đáp</Link>
              </Button>
            </div>
          ) : (
            <RemovedGroup
              items={skippedItems}
              pendingConceptIds={pendingConceptIds}
              onRestore={restore}
            />
          )}
        </>
      )}
    </div>
  );
}
