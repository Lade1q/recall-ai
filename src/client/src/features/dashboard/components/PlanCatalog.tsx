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

/** A1 (DB-01 [E1]) — chưa có kế hoạch nào. Onboarding thay cho một lưới trống. */
function CatalogOnboarding() {
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
        <p className="text-muted-foreground mb-5 text-pretty text-[13.5px] leading-[1.7]">
          Tải lên một chương bài giảng, hệ thống sẽ tách nó thành các khái niệm, tìm khái niệm nào
          là nền của khái niệm nào, rồi xếp lịch ôn theo đúng thứ tự đó.
        </p>
        <Button asChild>
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
}: {
  activePlans: PlanSummary[];
  hasAnyPlan: boolean;
  currentPlanId: string | null;
}) {
  if (activePlans.length === 0) {
    return hasAnyPlan ? <CatalogNoActive /> : <CatalogOnboarding />;
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
