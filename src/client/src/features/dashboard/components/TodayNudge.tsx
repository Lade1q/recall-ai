import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
// Deep-link đã chốt ở #127/#227, dùng chung với panel ngày của màn Lịch (#405).
import { focusHref, interviewHref } from '@/features/review-queue/utils/review-queue-links';
import type {
  ReviewQueueListResponse,
  ReviewReason,
} from '@/features/review-queue/types/review-queue.types';
import { cn } from '@/lib/utils';
import { Heading, headingVariants } from '@/components/ui/heading';

const CARD_CLASS = 'border-border bg-card overflow-hidden rounded-xl border';

/**
 * Accent của khối gợi ý theo LÝ DO của mục đứng đầu — chọn theo enum `reason`, KHÔNG ghép từ
 * tên khái niệm (đó mới là điều C4/AE-08 cấm). `traceback`/`deadline_priority` mang sắc
 * `remediate` (hệ thống tự chèn / gấp), ôn theo lịch dùng sắc AI, thêm tay thì trung tính.
 */
const REASON_TONE: Record<ReviewReason, 'remediate' | 'ai' | 'neutral'> = {
  traceback: 'remediate',
  spaced_repetition: 'ai',
  deadline_priority: 'remediate',
  manual: 'neutral',
};

/** Cột "Hàng đợi hôm nay · ≈ N phút" — mỗi mục là tên + `reasonText` (câu chữ do backend trả). */
function TodayQueue({ data }: { data: ReviewQueueListResponse }) {
  return (
    <div className="border-border bg-muted border-t p-6 sm:px-6 sm:py-7 md:border-l md:border-t-0">
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.06em]">
        Hàng đợi hôm nay · ≈ {data.totalEstimatedMinutes} phút
      </div>
      <ul className="mt-3.5">
        {data.items.map((item, index) => (
          <li
            key={item.id ?? item.conceptId}
            className="border-border flex gap-3 border-b py-3 last:border-b-0"
          >
            <span className="text-muted-foreground pt-0.5 font-mono text-xs tabular-nums">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-muted-foreground mt-0.5 text-xs leading-snug">
                {item.reasonText}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type DeferAction = 'snooze' | 'skip';

/**
 * Hai lối thoát của DB-09 (#233). Cùng một endpoint, nhưng **hai hành vi khác nhau** — và câu
 * phản hồi phải nói ra hệ quả khác nhau đó, nếu không thì "hoãn" và "bỏ qua" trông như một nút
 * "Ẩn" duy nhất: hoãn giữ khái niệm trên lịch (chỉ dời sang mai), bỏ qua gỡ nó khỏi lịch.
 */
const DEFER_ACTIONS: Record<
  DeferAction,
  { label: string; run: (itemId: string) => Promise<unknown>; success: string; failure: string }
> = {
  snooze: {
    label: 'Hoãn đến mai',
    run: (itemId) => reviewQueueApi.snoozeReviewQueueItem(itemId),
    success: 'Sẽ nhắc lại vào ngày mai.',
    failure: 'Chưa hoãn được gợi ý này. Vui lòng thử lại.',
  },
  skip: {
    label: 'Bỏ qua gợi ý',
    run: (itemId) => reviewQueueApi.updateReviewQueueItem(itemId, 'skipped'),
    success: 'Đã gỡ khỏi lịch — sửa lại trong Kế hoạch ôn tập.',
    failure: 'Chưa bỏ qua được gợi ý này. Vui lòng thử lại.',
  },
};

/** `.today__defer` của mockup: 13px, muted → foreground khi rê chuột, không phải nút. Nhẹ ký về
 *  thị giác là có chủ đích — đây là lối thoát, không được đứng ngang hàng hai nút hành động. */
const DEFER_CLASS =
  'text-muted-foreground hover:text-foreground focus-visible:outline-ring rounded-sm px-0.5 py-1.5 text-[13px] transition-colors [outline-style:none] focus-visible:outline-2 focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-50';

/**
 * Khối "Gợi ý hôm nay" (DB-04), điểm vào của vòng lặp học tập. Mục đứng đầu hàng đợi trở thành
 * tiêu đề: `name` (khái niệm cần làm) đặt cạnh `reasonText` (lý do do backend sinh) — cặp này
 * đã diễn đạt đúng "đã chèn [P], nền của [C]" của AE-08 mà KHÔNG ghép câu ở client và không để
 * tên khái niệm đứng trơ trọi. Không có nút "Đồng ý": lịch đã áp rồi, đây là chỗ *điều chỉnh*
 * chứ không phải cổng duyệt (epic #220) — nên hai lối thoát dưới đây cũng không hỏi lại.
 *
 * `onChanged` là `reload` của khối gợi ý (không phải của cả trang): sau khi hoãn/bỏ qua, hàng đợi
 * phải tự đọc lại từ server. Bỏ qua mục cuối cùng thì lần đọc đó trả `items: []` + `message`, và
 * `TodayNudge` chuyển sang `EmptyNudge` — trạng thái "đã xong hôm nay", không phải khoảng trắng.
 */
function ActiveNudge({
  data,
  onChanged,
}: {
  data: ReviewQueueListResponse;
  onChanged: () => void;
}) {
  const top = data.items[0];
  const [pendingAction, setPendingAction] = useState<DeferAction | null>(null);

  // Gợi ý ảo A3-fallback không có hàng thật trong DB để hoãn hay gỡ (server sẽ 404). Ẩn hẳn hai
  // lối thoát thay vì để chúng vô hiệu hoá: một nút xám không nói được vì sao nó xám.
  const itemId = top.id;

  const runDeferAction = (action: DeferAction): void => {
    if (itemId === null || pendingAction !== null) return;
    setPendingAction(action);

    void (async () => {
      try {
        await DEFER_ACTIONS[action].run(itemId);
        toast.success(DEFER_ACTIONS[action].success);
        onChanged();
      } catch (error) {
        console.error('Failed to defer today nudge', error);
        toast.error(DEFER_ACTIONS[action].failure);
      } finally {
        setPendingAction(null);
      }
    })();
  };

  return (
    <section className={`${CARD_CLASS} grid grid-cols-1 md:grid-cols-[1fr_320px]`}>
      <div className="p-6 sm:p-7">
        <Badge tone={REASON_TONE[top.reason]}>Gợi ý hôm nay</Badge>
        <Heading as="h2" size="section" className="mt-3.5 leading-[1.15] sm:text-[24px]">
          {top.name}
        </Heading>
        <p className="text-muted-foreground mt-2.5 max-w-[52ch] text-sm leading-[1.7]">
          {top.reasonText}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to={focusHref(top)}>Bắt đầu Focus Session</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={interviewHref(top)}>Vào thẳng phiên kiểm tra</Link>
          </Button>
          {itemId !== null &&
            (Object.keys(DEFER_ACTIONS) as DeferAction[]).map((action) => (
              <button
                key={action}
                type="button"
                className={DEFER_CLASS}
                // Khoá cả hai trong lúc một cái đang chạy: chúng đụng cùng một hàng, bấm chồng
                // lên nhau thì kết quả tuỳ thứ tự response về — hoãn rồi bỏ qua hay ngược lại.
                disabled={pendingAction !== null}
                aria-busy={pendingAction === action || undefined}
                onClick={() => runDeferAction(action)}
              >
                {DEFER_ACTIONS[action].label}
              </button>
            ))}
        </div>
      </div>
      <TodayQueue data={data} />
    </section>
  );
}

/**
 * Khung rỗng một cột dùng chung cho các trạng thái "không có mục nào hôm nay".
 * - Có `heading`: dùng cho A2b (câu chữ client) — tiêu đề serif + phần thân là chú thích mờ.
 * - Không `heading`: `body` chính là câu `message` backend trả về, render nguyên văn dưới dạng
 *   một câu editorial serif (kể cả emoji trong COMPLETED_TODAY_MESSAGE).
 */
function EmptyNudge({
  badge,
  heading,
  body,
  cta,
}: {
  badge?: { tone: 'ai'; label: string };
  heading?: string;
  body: string;
  cta: { to: string; label: string; primary?: boolean };
}) {
  return (
    <section className={`${CARD_CLASS} p-8 sm:p-10`}>
      <div className="mx-auto max-w-[520px] text-center">
        {badge ? (
          <Badge tone={badge.tone} className="mx-auto">
            {badge.label}
          </Badge>
        ) : null}
        {heading ? (
          <>
            <Heading as="h2" size="section" className="mt-3.5 leading-[1.2] sm:text-[22px]">
              {heading}
            </Heading>
            <p className="text-muted-foreground mx-auto mt-2.5 max-w-[46ch] text-sm leading-[1.7]">
              {body}
            </p>
          </>
        ) : (
          <p
            className={cn(headingVariants({ size: 'card' }), 'mx-auto max-w-[40ch] leading-[1.35]')}
          >
            {body}
          </p>
        )}
        <div className="mt-5 flex justify-center">
          <Button asChild variant={cta.primary ? 'default' : 'secondary'}>
            <Link to={cta.to}>{cta.label}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function TodayNudge({
  data,
  onChanged,
}: {
  data: ReviewQueueListResponse;
  onChanged: () => void;
}) {
  if (data.items.length > 0) {
    return <ActiveNudge data={data} onChanged={onChanged} />;
  }

  // A2b (#273): server cố ý trả `message: null` cho kế hoạch vừa xác nhận đồ thị mà chưa vấn đáp
  // lần nào. Đây là NGOẠI LỆ DUY NHẤT được client tự đặt câu chữ (bốn ca rỗng còn lại render
  // nguyên văn `message`). CTA về màn chọn phiên vì chưa có mục nào để suy ra được `planId`.
  if (data.message === null) {
    return (
      <EmptyNudge
        badge={{ tone: 'ai', label: 'Sẵn sàng' }}
        heading="Đồ thị đã sẵn sàng — bắt đầu phiên đầu tiên"
        // "kết quả" chứ không phải "phiên" (#345): tín hiệu bật nhánh này là hàng đợi rỗng, mà
        // hàng đợi chỉ sinh dòng khi có KẾT QUẢ chấm. Một phiên bỏ dở trước câu trả lời đầu tiên
        // (AE-03) là phiên thật nhưng không để lại kết quả nào — câu cũ nói dối đúng ca đó.
        body="Hệ thống chưa biết bạn đang nắm vững chỗ nào, vì kế hoạch này chưa có kết quả vấn đáp nào. Làm một phiên để bắt đầu — kết quả sẽ xếp lịch ôn cho những lần sau."
        cta={{ to: '/interview', label: 'Bắt đầu phiên vấn đáp', primary: true }}
      />
    );
  }

  // Các ca rỗng có `message` (chưa có kế hoạch / đã ôn xong hôm nay / kế hoạch còn draft / đã
  // lưu trữ hết): hiện đúng câu backend trả về. CTA về `/plans` — nơi duy nhất chung cho mọi ca
  // (tạo mới, kiểm chứng draft, bỏ lưu trữ, hoặc chỉ xem lại). Slice 2 sẽ tách CTA theo từng ca
  // khi có `/plans` để phân biệt.
  return <EmptyNudge body={data.message} cta={{ to: '/plans', label: 'Xem kế hoạch ôn tập' }} />;
}

export function TodayNudgeSkeleton() {
  return (
    <section className={`${CARD_CLASS} p-6 sm:p-7`} aria-hidden="true">
      <div className="text-muted-foreground mb-3.5 font-mono text-[11px]">
        Đang tải · Gợi ý hôm nay
      </div>
      <div className="bg-border h-[18px] w-[70px] animate-pulse rounded" />
      <div className="bg-border mt-3.5 h-5 w-[60%] animate-pulse rounded" />
      <div className="bg-border mt-3 h-3 w-[85%] animate-pulse rounded" />
      <div className="bg-border mt-2 h-3 w-[70%] animate-pulse rounded" />
      <div className="mt-6 flex gap-3">
        <div className="bg-border h-10 w-40 animate-pulse rounded-md" />
        <div className="bg-border h-10 w-44 animate-pulse rounded-md" />
      </div>
    </section>
  );
}
