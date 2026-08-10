import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import { dashboardApi } from '@/features/dashboard/api/dashboard.api';
import { useAsyncResource } from '@/features/dashboard/hooks/useAsyncResource';
import { BlockError } from '@/features/dashboard/components/BlockError';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { StatStrip, StatStripSkeleton } from '@/features/dashboard/components/StatStrip';
import { TodayNudge, TodayNudgeSkeleton } from '@/features/dashboard/components/TodayNudge';
import { PlanCatalog, PlanCatalogSkeleton } from '@/features/dashboard/components/PlanCatalog';
import { MiniConceptGraph } from '@/features/dashboard/components/MiniConceptGraph';
import { DeadlinePanel } from '@/features/dashboard/components/DeadlinePanel';

/**
 * Dashboard tổng quan (`/dashboard`, DB-01) — điểm vào của vòng lặp học tập.
 *
 * Theo thứ tự mockup: (1) header chào; (2) gợi ý hôm nay + hàng đợi (DB-04); (3) dải 3 chỉ số
 * (DB-01/#200); (4) danh mục kế hoạch `active`; (5) mini Concept Graph chỉ đọc (DB-02) + panel
 * "Sắp đến hạn".
 *
 * Ba nguồn dữ liệu độc lập (`/review-queue/today`, `/dashboard/stats`, `/plans`): mỗi khối tự
 * quản loading/error qua `useAsyncResource`, một cái hỏng không kéo cái kia thành màn trắng.
 */
export default function DashboardPage() {
  const today = useAsyncResource(() => reviewQueueApi.getToday());
  const stats = useAsyncResource(() => dashboardApi.getStats());
  const plans = useAsyncResource(() => planApi.listPlans());

  const activePlans = (plans.data ?? []).filter((plan) => plan.status === 'active');
  // Kế hoạch chứa khái niệm gợi ý hôm nay — dùng để tô đậm thẻ tương ứng và mở đúng đồ thị đó
  // trong mini graph. Chỉ là gợi ý trực quan: today hỏng thì không tô, mini graph về plan đầu.
  const currentPlanId = today.data?.items[0]?.planId ?? null;

  // A1 (DB-01 [E1]) — tài khoản hoàn toàn trống: mọi chỉ số bằng 0. Ẩn hẳn dải chỉ số thay vì
  // hiện ba số 0 cạnh khối gợi ý rỗng ("trông như app hỏng", mockup A1). Chỉ ẩn khi đã tải xong
  // và thật sự toàn 0 — plan `active` bất kỳ đều làm `conceptsTotal > 0`.
  const statsAllZero =
    stats.data !== null &&
    stats.data.conceptsTotal === 0 &&
    stats.data.studyStreakDays === 0 &&
    stats.data.weeklyStudyMinutes === 0;

  return (
    <div className="mx-auto w-full max-w-[1060px]">
      <DashboardHeader />

      {/* (2) Gợi ý hôm nay (DB-04) — đứng đầu vì là điểm vào vòng lặp học tập (FS-01/AE-01). */}
      <section className="mb-5">
        {today.loading && today.data === null ? (
          <TodayNudgeSkeleton />
        ) : today.error && today.data === null ? (
          <BlockError message="Không tải được gợi ý hôm nay." onRetry={today.reload} />
        ) : today.data ? (
          // `onChanged` = đọc lại đúng khối này sau khi hoãn / bỏ qua (DB-09 #233). Hai thao tác
          // đó chỉ đổi hàng đợi hôm nay, nên không kéo theo `/dashboard/stats` hay `/plans`.
          <TodayNudge data={today.data} onChanged={today.reload} />
        ) : null}
      </section>

      {/* (3) Dải 3 chỉ số (DB-01) — ẩn ở trạng thái tài khoản trống (A1). */}
      {!statsAllZero && (
        <section className="mb-10">
          {stats.loading && stats.data === null ? (
            <StatStripSkeleton />
          ) : stats.error && stats.data === null ? (
            <BlockError message="Không tải được các chỉ số nhanh." onRetry={stats.reload} />
          ) : stats.data ? (
            <StatStrip stats={stats.data} />
          ) : null}
        </section>
      )}

      {/* (4) Danh mục kế hoạch `active` (DB-01). */}
      <section className="mb-10">
        {plans.loading && plans.data === null ? (
          <PlanCatalogSkeleton />
        ) : plans.error && plans.data === null ? (
          <BlockError message="Không tải được danh mục kế hoạch." onRetry={plans.reload} />
        ) : plans.data ? (
          <PlanCatalog
            activePlans={activePlans}
            hasAnyPlan={plans.data.length > 0}
            currentPlanId={currentPlanId}
          />
        ) : null}
      </section>

      {/* (5) Mini Concept Graph (DB-02, chỉ đọc) + "Sắp đến hạn" — chỉ khi có kế hoạch `active`.
          Không có plan active thì hai khối này không có gì để vẽ; danh mục ở trên đã lo onboarding. */}
      {plans.data !== null && activePlans.length > 0 && (
        <div className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
          <MiniConceptGraph plans={activePlans} defaultPlanId={currentPlanId} />
          <DeadlinePanel plans={activePlans} />
        </div>
      )}
    </div>
  );
}
