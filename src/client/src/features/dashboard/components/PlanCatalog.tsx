import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MasteryBar } from '@/features/study-planner/components/MasteryBar';
import { formatDeadlineShort } from '@/features/study-planner/utils/planDates';
import type { PlanSummary } from '@/features/study-planner/types/concept';

/**
 * Thẻ kế hoạch trên Dashboard — bản RÚT GỌN của `PlanCard` (SP-03): chỉ tên + meta + thanh
 * phân bố mastery dùng chung (`MasteryBar`). KHÔNG menu ⋯, KHÔNG trạng thái "đang phân tích",
 * KHÔNG chân thẻ hàng đợi (ràng buộc #169: dashboard chỉ tóm tắt plan `active`; lưu trữ/xóa/phân
 * tích thuộc màn `/plans`). Cả thẻ là link mở đồ thị của kế hoạch.
 */
function DashboardPlanCard({ plan, isCurrent }: { plan: PlanSummary; isCurrent: boolean }) {
  const meta = [
    `${plan.conceptCount} khái niệm`,
    plan.deadline ? `hạn ${formatDeadlineShort(plan.deadline)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/plan/${plan.id}`}
      aria-label={`Mở kế hoạch ${plan.name}`}
      className={cn(
        'border-border bg-card hover:shadow-(--shadow-soft) flex flex-col rounded-xl border p-5 transition-shadow duration-150',
        // `--current` (mockup): kế hoạch chứa khái niệm gợi ý hôm nay — viền đậm để mắt bắt trước.
        isCurrent && 'border-foreground'
      )}
    >
      <h3 className="text-[15px] font-semibold leading-snug">{plan.name}</h3>
      <div className="text-muted-foreground mt-0.5 font-mono text-[11.5px]">{meta}</div>
      <div className="mt-4">
        <MasteryBar distribution={plan.masteryDistribution} total={plan.conceptCount} />
      </div>
    </Link>
  );
}

/**
 * A1 (DB-01 [E1]) — chưa có kế hoạch nào. Onboarding thay cho một lưới trống, và thay luôn cho
 * thẻ "Gợi ý hôm nay" (`TodayNudge`) mà `DashboardPage` cố ý không render trong ca này — mockup
 * A1 chỉ có MỘT thẻ, không phải hai thẻ nói cùng một điều bằng hai giọng khác nhau (#389).
 *
 * `message` là `NO_PLAN_MESSAGE` server trả về nguyên văn (cùng nguồn dữ liệu `TodayNudge` từng
 * dùng để tự render thẻ thứ hai) — không phải copy tự viết ở client. Quy tắc nằm ở mockup
 * `docs/analysis and design/claude-design/screen-dashboard.html`, khối `state__name` **A2b**:
 * trong bảy trạng thái của `TodayNudge`, A2b là ca DUY NHẤT client tự đặt chữ, bốn ca kia render
 * nguyên văn `message`.
 *
 * Trỏ vào `claude-design/` chứ không phải bản sao `ui-prototype/`: `src/` viện dẫn cây trước ở 11
 * tệp và cây sau ở 0 tệp, và hai cây đã lệch nhau. Trỏ tên khối chứ không phải số dòng — số dòng
 * vào một tệp còn được sửa thì lần sửa kế tiếp là sai (#446).
 *
 * `null` khi `/review-queue/today` chưa tải xong hoặc lỗi: chỉ ẩn đoạn thân bài, không thay bằng
 * chữ bịa ra. Ca lỗi không vì thế mà câm — `DashboardPage` giữ `BlockError` + "Thử lại" ngay
 * phía trên (`todayFailed`), nên chuyện hỏng đã được nói đúng một lần, ở đúng khối của nó.
 *
 * Nhưng "chưa tải xong" và "lỗi" là HAI ca, và chỉ ca sau mới có người nói hộ. `pending` tách
 * chúng ra: lúc `/review-queue/today` còn bay thì chỗ của câu server là một vạch đang tải, không
 * phải khoảng trống. Không có vế này thì thẻ trông như đã tải xong nhưng rỗng ruột, đúng bằng
 * khoảng `/review-queue/today` về sau `/plans` — đo được 79→879ms ở mức trễ 800ms (#445 cơ chế ①).
 *
 * Vạch tải KHÔNG phá quy tắc "chỉ A2b được client tự đặt chữ" (mockup `claude-design/
 * screen-dashboard.html`): nó không phải chữ, và chú thích khối A1 của chính mockup chỉ vẽ ca ĐÃ
 * CÓ `message` — nó cấm thay câu server bằng câu client, không cấm báo "đang tải".
 */
function CatalogOnboarding({ message, pending }: { message: string | null; pending: boolean }) {
  return (
    <div className="border-border bg-card rounded-xl border px-7 py-10">
      <div className="mx-auto max-w-[460px] text-center">
        <div
          className="text-muted-foreground mb-4 flex justify-center opacity-55"
          aria-hidden="true"
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5.5" cy="12" r="2.4" />
            <circle cx="12" cy="5.6" r="2.4" />
            <circle cx="12" cy="18.4" r="2.4" />
            <circle cx="18.5" cy="12" r="2.4" />
            <path d="M7.6 10.6l2.4-2.6M7.6 13.4l2.4 2.6M14.2 7.6l2.5 2.6M14.2 16.4l2.5-2.6" />
          </svg>
        </div>
        <h2 className="font-heading mb-2 text-[20px] tracking-[-0.02em]">
          Bắt đầu kế hoạch ôn tập đầu tiên
        </h2>
        {/* `min-h` giữ chỗ đúng MỘT dòng cho ca `message === null`, nên CTA không giật khi câu
            của server về — chừng nào câu đó còn nằm gọn một dòng.

            ⚠️ Ca `message === null` nay TÁCH ĐÔI (#445): `pending` vẽ vạch tải vào đúng chỗ trống
            đó, chỉ ca LỖI mới còn là khoảng trắng thật. Chỗ giữ vẫn là một dòng ở cả hai — vạch
            cao `h-3` < `1.7em` — nên toàn bộ lập luận ngưỡng bên dưới không đổi. Nhưng ai đọc
            dòng đầu mà tưởng chỉ có một ca thì sẽ đo nhầm: đo ngưỡng phải đo ở ca LỖI.

            Ngưỡng là ngưỡng của CỘT CHỮ chứ không phải của viewport: `<p>` rộng ≥ 415px thì câu
            hiện tại nằm một dòng (22,9px), hẹp hơn thì xuống hai (45,9px) và CTA giật 23px.
            Quy ra viewport thì cộng phần khung bao quanh — `<main>` `p-4` của `MainLayout` (32px),
            viền thẻ (2px), `px-7` của thẻ (56px) = 90px — nên `415 + 90 ≈ 505px`. Tức là MỌI bề
            ngang dưới ~505px đều giật, kể cả 455px, không riêng 360px.

            ⚠️ Hai thứ làm dòng này lỗi thời mà KHÔNG gì đỏ (jsdom không dựng layout):
            ① đổi `NO_PLAN_MESSAGE` (hiện 64 ký tự) là đổi ngưỡng 415px;
            ② hạ trần `max-w-[460px]` ngay trên xuống dưới 415px thì câu xuống hai dòng ở MỌI bề
            ngang — dư địa hiện chỉ 45px. Đo lại thì đo trên app thật: một trang dựng lại thiếu
            `<main>` `p-4` sẽ cho ngưỡng viewport lệch đúng 32px (#454).

            Nâng `min-h` lên hai dòng chữa được nhưng chừa khoảng trống thừa ở mọi bề ngang khác,
            nên để nguyên và ghi lại giới hạn thay vì hứa nhiều hơn thứ nó làm được (#446). */}
        <p
          className={cn(
            'text-muted-foreground mb-5 min-h-[1.7em] text-pretty text-[13.5px] leading-[1.7]',
            pending && 'flex items-center justify-center'
          )}
        >
          {pending ? (
            <span
              className="bg-border block h-3 w-[70%] max-w-[290px] animate-pulse rounded"
              aria-hidden="true"
            />
          ) : (
            message
          )}
        </p>
        {/* Vạch tải ở trên là tín hiệu THỊ GIÁC; trình đọc màn hình không thấy `animate-pulse`.
            Cùng khuôn `sr-only` + `role="status"` + `aria-live` ở `RunningSession.tsx` — và khuôn
            đó gồm cả chi tiết dễ bỏ sót: **vùng luôn có mặt, chỉ CHỮ đổi**.

            ⚠️ `{pending && <p role="status">…</p>}` trông tương đương nhưng không phải: live
            region xuất hiện CÙNG LÚC với nội dung của nó thì AT không có gì để so sánh và thường
            không đọc. Phải mount sẵn vùng rỗng rồi mới đổ chữ vào. Test `getByRole('status')` chỉ
            hỏi "có trong DOM không", nên nó KHÔNG bắt được lỗi này — đó là lý do ca dưới đây khoá
            *nội dung* của vùng ở cả hai trạng thái chứ không khoá sự tồn tại. */}
        <p className="sr-only" role="status" aria-live="polite">
          {pending ? 'Đang tải gợi ý mở đầu' : ''}
        </p>
        <Button asChild size="lg">
          <Link to="/plan/new">Tạo kế hoạch đầu tiên</Link>
        </Button>
      </div>
    </div>
  );
}

/** A1b/A1c — có kế hoạch nhưng không cái nào `active` (còn draft, hoặc đã lưu trữ hết). Khối
 *  gợi ý phía trên đã nói rõ ca nào (chữ backend); ở đây chỉ trỏ về nơi xử lý — màn `/plans`. */
function CatalogNoActive() {
  return (
    <div className="border-border bg-card rounded-xl border px-7 py-9 text-center">
      <p className="text-muted-foreground text-[13.5px] leading-[1.7]">
        Chưa có kế hoạch nào đang hoạt động.
      </p>
      <div className="mt-4 flex justify-center">
        <Button asChild variant="secondary">
          <Link to="/plans">Xem tất cả kế hoạch</Link>
        </Button>
      </div>
    </div>
  );
}

export function PlanCatalog({
  activePlans,
  hasAnyPlan,
  currentPlanId,
  noPlanMessage,
  noPlanMessagePending,
}: {
  activePlans: PlanSummary[];
  hasAnyPlan: boolean;
  currentPlanId: string | null;
  noPlanMessage: string | null;
  noPlanMessagePending: boolean;
}) {
  if (activePlans.length === 0) {
    return hasAnyPlan ? (
      <CatalogNoActive />
    ) : (
      <CatalogOnboarding message={noPlanMessage} pending={noPlanMessagePending} />
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-[17px] font-semibold">Kế hoạch ôn tập</h2>
          <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
            {activePlans.length} kế hoạch đang hoạt động —{' '}
            <Link
              to="/plans"
              className="text-foreground border-border hover:border-foreground border-b transition-colors"
            >
              xem tất cả kế hoạch
            </Link>{' '}
            để lưu trữ, xóa hoặc theo dõi kế hoạch đang phân tích
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/plan/new">
            <Plus />
            Tạo kế hoạch mới
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activePlans.map((plan) => (
          <DashboardPlanCard key={plan.id} plan={plan} isCurrent={plan.id === currentPlanId} />
        ))}
      </div>
    </section>
  );
}

export function PlanCatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-border bg-card rounded-xl border p-5">
          <div className="bg-border h-4 w-3/5 animate-pulse rounded" />
          <div className="bg-border mt-2 h-3 w-2/5 animate-pulse rounded" />
          <div className="bg-border mt-5 h-2.5 w-full animate-pulse rounded" />
          <div className="bg-border mt-3 h-3 w-4/5 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
