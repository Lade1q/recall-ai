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
        {MASTERY_BANDS.map(({ key, label, color }) => {
          // A zero keeps its slot so the four bands sit in the same place on every card.
          // The thing that has to recede is the DOT — a red square next to "0 yếu" reads as
          // a warning that is not there. It used to recede by fading the whole `span`, which
          // dragged the label down with it: measured 1.88:1 in light, 2.26:1 in dark.
          //
          // Fading the label less is not on the table, but not because no alpha passes --
          // measured, the break-even is alpha 0.93 in light (`--muted-foreground` on `--card`
          // starts at 5.20:1) and 0.82 in dark (starts at 6.16:1). The point is that every
          // alpha strong enough to READ as "empty" is below those: 0.85 gives 3.81 in light.
          // So the dimming moves onto the dot alone, and the "this band is empty" cue moves
          // onto the count, which drops from `--foreground` to `--muted-foreground`: still
          // 5.20:1 light / 6.16:1 dark, quieter than a band that actually has concepts in it.
          const empty = distribution[key] === 0;
          return (
            <span key={key} className="inline-flex min-w-0 items-center gap-1.5">
              <i
                className={`rounded-xs block size-2 flex-none ${empty ? 'opacity-45' : ''}`}
                style={{ background: color }}
              />
              <b
                className={`font-mono font-semibold tabular-nums ${
                  empty ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {distribution[key]}
              </b>
              {label}
            </span>
          );
        })}
      </div>
    </>
  );
}
