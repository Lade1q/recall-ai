/* eslint-disable react-refresh/only-export-components */
import { MasteryDistribution } from '../types/concept';

/**
 * The four mastery bands, in the order they read on the bar: best understood to never asked.
 * Shared so the SP-03 plan card, the dashboard plan catalog and the dashboard mini-graph legend
 * all name and colour the bands identically — one source, no drift.
 */
export const MASTERY_BANDS = [
  { key: 'strong', label: 'vững', color: 'var(--mastery-strong)' },
  { key: 'learning', label: 'đang học', color: 'var(--mastery-learning)' },
  { key: 'weak', label: 'yếu', color: 'var(--mastery-weak)' },
  { key: 'untested', label: 'chưa kiểm tra', color: 'var(--mastery-untested)' },
] as const satisfies readonly { key: keyof MasteryDistribution; label: string; color: string }[];

/**
 * The mastery split as a bar plus a counted legend.
 *
 * A single aggregate percentage is the obvious alternative and the wrong one — it hides the
 * weak concepts, which are the only part a student can act on. The four tokens all sit near
 * L 0.5, so the segments are separated by gaps rather than by contrast, and every number is
 * spelled out in the legend: colour alone is never the only signal (Design System v3).
 */
export function MasteryBar({
  distribution,
  total,
}: {
  distribution: MasteryDistribution;
  total: number;
}) {
  if (total === 0) return null;

  return (
    <>
      <div className="gap-0.75 mb-3 flex h-2.5" aria-hidden="true">
        {MASTERY_BANDS.filter(({ key }) => distribution[key] > 0).map(({ key, color }) => (
          <span
            key={key}
            className="rounded-xs block min-w-0"
            style={{ width: `${(distribution[key] / total) * 100}%`, background: color }}
          />
        ))}
      </div>

      <div className="text-muted-foreground grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-xs">
        {MASTERY_BANDS.map(({ key, label, color }) => (
          <span
            key={key}
            // A zero keeps its slot so the four bands sit in the same place on every card,
            // but dimmed: a red dot next to "0 yếu" reads as a warning that is not there.
            className={`inline-flex min-w-0 items-center gap-1.5 ${
              distribution[key] === 0 ? 'opacity-45' : ''
            }`}
          >
            <i className="rounded-xs block size-2 flex-none" style={{ background: color }} />
            <b className="text-foreground font-mono font-semibold tabular-nums">
              {distribution[key]}
            </b>
            {label}
          </span>
        ))}
      </div>
    </>
  );
}
