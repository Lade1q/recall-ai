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

  // A1 (DB-01 [E1]) đúng nghĩa đen — 0 KẾ HOẠCH, không phải 0 mục hàng đợi. Suy trực tiếp từ dữ
  // kiện client đã có (độ dài danh mục kế hoạch), KHÔNG parse chuỗi `message` (#389). `null` khi
  // `plans` chưa tải xong: chưa biết ca nào thì không được đoán.
  const isBrandNewAccount = plans.data !== null && plans.data.length === 0;

  // Ngoại lệ DUY NHẤT của việc ẩn khối gợi ý ở ca A1: khi khối đó đang có LỖI để báo. Không có
  // vế này thì `BlockError` + "Thử lại" bị ẩn theo, và tài khoản 0 kế hoạch gặp
  // `/review-queue/today` hỏng sẽ còn đúng một thẻ câm — không báo lỗi, không nút nào, không
  // đường phục hồi ngoài F5 (hồi quy bắt được ở review PR #408). Đó cũng là lúc bất biến
  // ba-nguồn-độc-lập ở đầu file bị phá: khối của nguồn `/plans` im lặng nuốt lỗi của nguồn
  // `/review-queue/today`.
  //
  // Đúng MỘT biểu thức dùng ở CẢ HAI nơi — cổng của `<section>` ngay dưới, và nhánh `BlockError`
  // bên trong nó. Trước #454 hai chỗ chép tay cùng một điều kiện kèm lời hứa "không ai sửa một
  // bên mà quên bên kia"; lời hứa đó không có gì cưỡng chế — đột biến bỏ một vế ở MỘT bên sống
  // qua toàn bộ suite. Nay thay bằng thứ không thể lệch: cùng một hằng.
  //
  // Cố ý KHÔNG dùng `today.data !== null`: `useAsyncResource` khởi tạo `data: null`, nên điều
  // kiện đó gộp cả ca ĐANG TẢI vào, làm skeleton gợi ý nhấp nháy rồi tan ở mọi tài khoản trống —
  // đúng thứ mockup A1 cấm.
  //
  // Vế `&& today.data === null` gánh hành vi THẬT, và chính việc gộp thành một hằng làm nó lộ
  // ra: ở CỔNG thì nó chỉ đụng tài khoản 0 kế hoạch (nơi chưa nút nào mount được để gọi
  // `reload`, nên có vẻ vô hại), nhưng ở NHÁNH `BlockError` dưới đây thì không có giới hạn ấy.
  // Đường tới: tài khoản CÓ kế hoạch hoãn một mục → `onChanged` đọc lại → lần đọc lại hỏng ⇒
  // `error` bật trong khi `data` cũ vẫn còn (`useAsyncResource` cố ý giữ). Bỏ vế này đi thì cả
  // khối gợi ý đang đọc dở bị thay bằng `BlockError` chỉ vì một lần refetch nền hỏng. Có test
  // ghim (#454).
  const todayFailed = today.error && today.data === null;

  // Anh em của `todayFailed`, cùng lý do gộp thành MỘT hằng dùng ở hai nơi: nhánh
  // `TodayNudgeSkeleton` ngay dưới, và `noPlanMessagePending` của `PlanCatalog`. Cả hai trả lời
  // cùng một câu hỏi — "khối today đã có gì để hiện chưa" — nên chép tay hai lần là để ngỏ đúng
  // kiểu lệch mà #454 vừa dẹp ở `todayFailed`.
  //
  // Thẻ onboarding A1 lấy thân bài từ `/review-queue/today`, nên nó có một khoảng chưa-biết-gì
  // dài đúng bằng khoảng endpoint đó về SAU `/plans`. Không có cờ này thì khoảng đó im lặng
  // tuyệt đối: thẻ trông như đã tải xong nhưng rỗng ruột (#445 cơ chế ①).
  //
  // Vế `&& today.data === null` gánh hành vi thật, y như ở `todayFailed`: bỏ nó đi thì MỌI lần
  // đọc lại — kể cả lần sau khi hoãn một mục — giật khối gợi ý về skeleton, tức nội dung đang
  // đọc biến mất trong lúc chẳng có gì hỏng.
  const todayPending = today.loading && today.data === null;

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

      {/* (2) Gợi ý hôm nay (DB-04) — đứng đầu vì là điểm vào vòng lặp học tập (FS-01/AE-01).
          Ẩn hẳn ở tài khoản 0-kế-hoạch: mockup A1 chỉ có MỘT thẻ, và thẻ đó là onboarding của
          danh mục kế hoạch bên dưới — không phải khối này (#389). Trừ khi khối đang LỖI, xem
          `todayFailed`.

          ⚠️ `!isBrandNewAccount` cũng đang là thứ DUY NHẤT chặn nhánh `NO_PLAN_MESSAGE` của
          `TodayNudge` — nhánh `EmptyNudge` cuối cùng, ca "hàng đợi rỗng nhưng CÓ `message`".
          Nhánh đó vẫn còn nguyên CTA `/plans`, mà `/plans` với người mới lại là một màn trống
          nữa (#383 mục 1) — nên bỏ điều kiện này mà không sửa CTA kia sẽ làm lỗi #389 vừa đóng
          sống lại một cách lặng lẽ. `todayFailed` thì an toàn: ca lỗi không bao giờ đi tới nhánh
          đó, nó dừng ở `BlockError`.

          (Trỏ TÊN nhánh chứ không phải số dòng. Trích dẫn cũ ở đây là `TodayNudge.tsx:255`, và
          dòng 255 nay nằm trong thân `TodayNudgeSkeleton` — lệch mà không gì đỏ, đúng lớp lỗi
          #446 dẹp.) */}
      {(!isBrandNewAccount || todayFailed) && (
        <section className="mb-5">
          {todayPending ? (
            <TodayNudgeSkeleton />
          ) : todayFailed ? (
            <BlockError message="Không tải được gợi ý hôm nay." onRetry={today.reload} />
          ) : today.data ? (
            // `onChanged` = đọc lại đúng khối này sau khi hoãn / bỏ qua (DB-09 #233). Hai thao tác
            // đó chỉ đổi hàng đợi hôm nay, nên không kéo theo `/dashboard/stats` hay `/plans`.
            <TodayNudge data={today.data} onChanged={today.reload} />
          ) : null}
        </section>
      )}

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
            noPlanMessage={today.data?.message ?? null}
            noPlanMessagePending={todayPending}
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
