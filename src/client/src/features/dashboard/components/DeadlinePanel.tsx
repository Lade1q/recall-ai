import { cn } from '@/lib/utils';
import { Heading } from '@/components/ui/heading';
import { daysUntilDeadline, formatTimeLeft } from '@/features/study-planner/utils/planDates';
import type { PlanSummary } from '@/features/study-planner/types/concept';

/** Mốc "gấp" — dưới ngần này ngày thì tô `--remediate` (mockup: 3 ngày đỏ, 9/21 ngày mờ). */
const URGENT_DAYS = 3;

/**
 * Panel "Sắp đến hạn" (DB-01) — deadline mọi plan `active`, sắp theo gần nhất.
 *
 * "còn N khái niệm chưa vững" = `conceptCount − masteryDistribution.strong`, TÍNH Ở CLIENT: không
 * có (và không cần) endpoint `/dashboard/deadlines`. Chữ thời gian dùng `formatTimeLeft` để khớp
 * đúng "quá hạn N ngày" của thẻ kế hoạch. "Xem lịch →" (DB-07/#234, Sprint 5) chưa có màn nên
 * KHÔNG render — một nút xám không giải thích được vì sao nó xám.
 */
export function DeadlinePanel({ plans }: { plans: PlanSummary[] }) {
  const now = new Date();
  const items = plans
    .filter((plan): plan is PlanSummary & { deadline: string } => Boolean(plan.deadline))
    .map((plan) => ({ plan, days: daysUntilDeadline(plan.deadline, now) }))
    .filter(
      (entry): entry is { plan: PlanSummary & { deadline: string }; days: number } =>
        entry.days !== null
    )
    .sort((a, b) => a.days - b.days);

  return (
    <section className="border-border bg-card sm:px-6.5 rounded-xl border p-6 sm:py-6">
      <Heading as="h2" size="card" className="font-semibold">
        Sắp đến hạn
      </Heading>
      <p className="text-muted-foreground mb-4 mt-1 text-[13px]">Trên tất cả kế hoạch</p>

      {items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-[13px]">
          Chưa có kế hoạch nào đặt hạn ôn.
        </p>
      ) : (
        <div>
          {items.map(({ plan, days }) => {
            const notStrong = plan.conceptCount - plan.masteryDistribution.strong;
            const overdue = days < 0;
            return (
              <div
                key={plan.id}
                className="border-border flex items-center justify-between gap-3 border-b py-3.5 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate">{plan.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {notStrong > 0
                      ? `còn ${notStrong} khái niệm chưa vững`
                      : 'đã vững toàn bộ khái niệm'}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap font-mono text-[13px] tabular-nums',
                    days <= URGENT_DAYS ? 'text-remediate' : 'text-muted-foreground',
                    overdue && 'font-semibold'
                  )}
                >
                  {formatTimeLeft(plan.deadline, now)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-border mt-3 flex items-center border-t pt-4 text-[13px]">
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {plans.length} kế hoạch
        </span>
      </div>
    </section>
  );
}
