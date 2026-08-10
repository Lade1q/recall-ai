import type { ReactNode } from 'react';
import type { DashboardStats } from '../types/dashboard.types';
import { formatStudyMinutes } from '../utils/format';

const STRIP_CLASS = 'border-border bg-card grid grid-cols-3 overflow-hidden rounded-xl border';
const ITEM_CLASS = 'border-border border-l px-4 py-4 first:border-l-0 sm:px-6 sm:py-[18px]';

function StatItem({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className={ITEM_CLASS}>
      <div className="font-mono text-xl font-semibold tabular-nums tracking-[-0.01em] sm:text-2xl">
        {value}
      </div>
      <div className="text-muted-foreground mt-1 text-[11px] leading-snug sm:text-xs">{label}</div>
    </div>
  );
}

/**
 * Dải 3 chỉ số của DB-01 — dùng THẲNG số của `/dashboard/stats`, không tự cộng ở client.
 * Con số là kênh đọc chính (mono, tabular), đặt cạnh nhãn chữ; màu không tham gia tín hiệu.
 */
export function StatStrip({ stats }: { stats: DashboardStats }) {
  return (
    <div className={STRIP_CLASS}>
      <StatItem value={stats.studyStreakDays} label="ngày ôn liên tiếp" />
      <StatItem
        value={formatStudyMinutes(stats.weeklyStudyMinutes)}
        label="thời gian học tuần này"
      />
      <StatItem
        value={
          <>
            {stats.conceptsMastered}
            <span className="text-muted-foreground text-[15px]">/{stats.conceptsTotal}</span>
          </>
        }
        label="khái niệm đạt mastery_score ≥ 0.8"
      />
    </div>
  );
}

export function StatStripSkeleton() {
  return (
    <div className={STRIP_CLASS} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={ITEM_CLASS}>
          <div className="bg-border h-6 w-12 animate-pulse rounded" />
          <div className="bg-border mt-2 h-3 w-20 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
