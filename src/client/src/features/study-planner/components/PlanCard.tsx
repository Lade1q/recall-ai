import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MasteryDistribution, PlanSummary } from '../types/concept';
import { formatDeadlineShort, formatElapsed, formatTimeLeft } from '../utils/planDates';

/**
 * One plan on the SP-03 list.
 *
 * Two shapes, because a plan being analysed is not the same object to a user as a plan they
 * can study: the analysing one is a dashed, unclickable card that reports progress, the
 * finished one is a link into its concept graph.
 */

/** The four mastery bands, in the order they read on the bar: best understood to never asked. */
const BANDS = [
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
function MasteryBar({ distribution, total }: { distribution: MasteryDistribution; total: number }) {
  if (total === 0) return null;

  return (
    <>
      <div className="mb-3 flex h-2.5 gap-[3px]" aria-hidden="true">
        {BANDS.filter(({ key }) => distribution[key] > 0).map(({ key, color }) => (
          <span
            key={key}
            className="block min-w-0 rounded-[2px]"
            style={{ width: `${(distribution[key] / total) * 100}%`, background: color }}
          />
        ))}
      </div>

      <div className="text-muted-foreground grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-xs">
        {BANDS.map(({ key, label, color }) => (
          <span
            key={key}
            // A zero keeps its slot so the four bands sit in the same place on every card,
            // but dimmed: a red dot next to "0 yếu" reads as a warning that is not there.
            className={`inline-flex min-w-0 items-center gap-1.5 ${
              distribution[key] === 0 ? 'opacity-45' : ''
            }`}
          >
            <i className="block size-2 flex-none rounded-[2px]" style={{ background: color }} />
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

/**
 * The one line under the title that says what to do next. Weak concepts outrank untested
 * ones: a concept the student got wrong is a known gap, an untested one is only unknown.
 */
function progressHint(distribution: MasteryDistribution, total: number): string {
  if (total === 0) return 'Chưa có khái niệm nào';
  if (distribution.weak > 0) return `${distribution.weak} khái niệm yếu đang chờ ôn lại`;
  if (distribution.untested > 0) return `${distribution.untested} khái niệm chưa kiểm tra lần nào`;
  return 'Toàn bộ khái niệm đã vững';
}

interface PlanCardProps {
  plan: PlanSummary;
  /** Ticks once a second so the "Đang phân tích" clock advances. */
  now: Date;
  onArchive: (plan: PlanSummary) => void;
  onRestore: (plan: PlanSummary) => void;
  onReanalyze: (plan: PlanSummary) => void;
  onDelete: (plan: PlanSummary) => void;
  isBusy: boolean;
}

export function PlanCard({
  plan,
  now,
  onArchive,
  onRestore,
  onReanalyze,
  onDelete,
  isBusy,
}: PlanCardProps) {
  const isAnalysing = plan.analysisStatus === 'pending' || plan.analysisStatus === 'processing';
  const isDraft = plan.status === 'draft';
  const isArchived = plan.status === 'archived';

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={isBusy}
          // z-2 lifts the trigger above the stretched link overlay below, which is the only
          // thing keeping a menu click from also opening the plan.
          className="text-muted-foreground hover:text-foreground z-2 relative -mr-1 flex-none"
          aria-label={`Tuỳ chọn cho ${plan.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {isArchived ? (
          <DropdownMenuItem onSelect={() => onRestore(plan)}>
            <ArchiveRestore />
            Bỏ lưu trữ
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onArchive(plan)}>
            <Archive />
            Lưu trữ kế hoạch
          </DropdownMenuItem>
        )}

        {/* SP-05 re-reads the document the plan was built from; a draft has no graph to
            refresh yet, and an archived plan is restored first. */}
        {plan.status === 'active' && (
          <DropdownMenuItem onSelect={() => onReanalyze(plan)} disabled={isAnalysing}>
            <RefreshCw />
            Phân tích lại tài liệu
          </DropdownMenuItem>
        )}

        {/* Separated by a rule: archiving is reversible, this is not. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(plan)}>
          <Trash2 />
          Xóa vĩnh viễn
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ---------- Draft: still being analysed, or the analysis failed ----------
  if (isDraft) {
    const elapsed = plan.analysisStartedAt ? formatElapsed(plan.analysisStartedAt, now) : null;
    const meta = [
      plan.document?.filename,
      plan.document?.pageCount ? `${plan.document.pageCount} trang` : null,
      isAnalysing ? elapsed : null,
    ].filter(Boolean);

    return (
      <div
        className={`border-border bg-card rounded-xl border border-dashed px-5 pb-[18px] pt-5 ${
          isBusy ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2.5">
          {isAnalysing ? (
            <Badge tone="ai">Đang phân tích</Badge>
          ) : (
            <Badge tone="weak">Phân tích lỗi</Badge>
          )}
          {actions}
        </div>

        <h2 className="font-heading mb-[3px] mt-2.5 text-[18px] leading-tight tracking-[-0.015em]">
          {plan.name}
        </h2>

        {meta.length > 0 && (
          <div className="text-muted-foreground font-mono text-[11.5px]">{meta.join(' · ')}</div>
        )}

        <p className="text-muted-foreground mt-3.5 line-clamp-2 text-pretty text-[12.5px] leading-[1.65]">
          {isAnalysing
            ? 'AI đang trích xuất khái niệm. Đồ thị sẽ mở được ngay khi xong — bạn không cần chờ ở đây.'
            : (plan.analysisErrorMessage ??
              'Không trích xuất được khái niệm từ tài liệu này. Mở kế hoạch để xem chi tiết và thử lại.')}
        </p>

        <div className="border-border mt-3.5 border-t pt-3.5 text-[12.5px]">
          <Link
            to={`/plan/${plan.id}`}
            className="text-foreground border-border hover:border-foreground border-b transition-colors"
          >
            {isAnalysing ? 'Xem tiến trình' : 'Xem chi tiết'}
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Active or archived: a graph the student can open ----------
  const meta = [
    `${plan.conceptCount} khái niệm`,
    plan.deadline ? `hạn ${formatDeadlineShort(plan.deadline)}` : null,
    plan.deadline && !isArchived ? formatTimeLeft(plan.deadline, now) : null,
  ].filter(Boolean);

  return (
    <div
      className={`border-border bg-card relative rounded-xl border px-5 pb-[18px] pt-5 transition-shadow duration-150 hover:shadow-[var(--shadow-soft)] ${
        isBusy ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {/* A stretched link rather than a wrapper around the card: nesting the actions menu
          inside an <a> meant choosing "Lưu trữ" also navigated into the plan. As a sibling
          overlay it covers the card, and the trigger above it stays its own click target. */}
      <Link
        to={`/plan/${plan.id}`}
        aria-label={`Mở kế hoạch ${plan.name}`}
        className="z-1 absolute inset-0 rounded-xl"
      />

      <div className="mb-[3px] flex items-start justify-between gap-2.5">
        <h2 className="font-heading text-[18px] leading-tight tracking-[-0.015em]">{plan.name}</h2>
        {actions}
      </div>

      <div className="text-muted-foreground mb-4 font-mono text-[11.5px]">{meta.join(' · ')}</div>

      <MasteryBar distribution={plan.masteryDistribution} total={plan.conceptCount} />

      <div className="border-border text-muted-foreground mt-3.5 flex items-center gap-2 border-t pt-3 text-[12.5px]">
        {isAnalysing ? (
          <>
            <RefreshCw className="size-3.5 flex-none animate-spin" />
            Đang phân tích lại — đồ thị hiện tại vẫn dùng được
          </>
        ) : (
          progressHint(plan.masteryDistribution, plan.conceptCount)
        )}
      </div>
    </div>
  );
}
