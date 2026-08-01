import { AnalysisPhase } from '../types/concept';
import { formatElapsed } from '../utils/planDates';

/**
 * SP-06's 4-phase progress panel (Issue #186) — the mockup's answer to "a 42-page PDF takes
 * tens of seconds; an indefinite spinner reads as hung." Phase 1 (upload) is always done by
 * the time this panel can render: the Document is created in the same transaction as the
 * AnalysisJob, before the job's own status can be anything but `pending`.
 */

const PHASE_ORDER: AnalysisPhase[] = ['sending_to_ai', 'extracting', 'validating'];

type SubPhaseState = 'done' | 'now' | 'pending';

function subPhaseState(order: number, currentIndex: number): SubPhaseState {
  if (order < currentIndex) return 'done';
  if (order === currentIndex) return 'now';
  return 'pending';
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12.5l5.2 5.2L20 7" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      className="animate-spin [animation-duration:900ms]"
    >
      <circle cx="12" cy="12" r="9" opacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  );
}

const PHASE_ICON: Record<SubPhaseState, () => React.ReactElement> = {
  done: CheckIcon,
  now: SpinIcon,
  pending: DotIcon,
};

const PHASE_ICON_COLOR: Record<SubPhaseState, string> = {
  done: 'text-mastery-strong',
  now: 'text-ai-accent',
  pending: 'text-muted-foreground',
};

interface AnalysisProgressPanelProps {
  filename?: string | null;
  pageCount?: number | null;
  /** A `text` document is inlined into the extract call — it never goes through "gửi tài
   *  liệu tới AI Service", so that row must not appear at all for one (Issue #186). */
  documentKind?: 'pdf' | 'image' | 'text' | null;
  startedAt?: string | null;
  /** Ticks once a second in the parent, so the elapsed clock counts smoothly between polls. */
  now: Date;
  phase: AnalysisPhase | null;
  /**
   * True once the AnalysisJob has actually finished. `phase` alone tops out at `validating`,
   * which would otherwise leave the last row stuck showing its spinner forever — the caller
   * must hold this view for a beat after completion so the user actually sees that checkmark
   * before swapping to the next screen, instead of the cut feeling instantaneous.
   */
  complete?: boolean;
}

export function AnalysisProgressPanel({
  filename,
  pageCount,
  documentKind,
  startedAt,
  now,
  phase,
  complete = false,
}: AnalysisProgressPanelProps) {
  const currentIndex = complete ? PHASE_ORDER.length : phase ? PHASE_ORDER.indexOf(phase) : 0;
  const skipsSendPhase = documentKind === 'text';

  const phases: { label: string; state: SubPhaseState }[] = [
    {
      label: `Tải tệp lên kho lưu trữ · lưu bản ghi documents${
        pageCount ? ` (${pageCount} trang)` : ''
      }`,
      state: 'done',
    },
    ...(skipsSendPhase
      ? []
      : [{ label: 'Gửi tài liệu tới AI Service', state: subPhaseState(0, currentIndex) }]),
    {
      label: 'Trích xuất khái niệm, độ khó và quan hệ tiên quyết',
      state: subPhaseState(1, currentIndex),
    },
    { label: 'Kiểm tra chu trình (DAG) và dựng đồ thị', state: subPhaseState(2, currentIndex) },
  ];

  const elapsed = startedAt ? formatElapsed(startedAt, now) : null;
  const clockMeta = [pageCount ? `${pageCount} trang` : null, elapsed].filter(Boolean).join(' · ');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 flex w-full max-w-[620px] flex-col gap-3.5 duration-300">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">
          Đang phân tích &ldquo;{filename ?? 'tài liệu'}&rdquo;
        </span>
        {clockMeta && (
          <span className="text-muted-foreground shrink-0 font-mono text-xs">{clockMeta}</span>
        )}
      </div>

      <div className="flex gap-1" aria-hidden="true">
        {phases.map((p, i) => (
          <i
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              p.state === 'pending' ? 'bg-border' : 'bg-ai-accent'
            }`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {phases.map((p, i) => {
          const Icon = PHASE_ICON[p.state];
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 text-[13px] transition-colors duration-300 ${
                p.state === 'now' ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              <span
                key={p.state}
                className={`animate-in zoom-in-50 fade-in flex size-[15px] flex-none items-center justify-center duration-300 ${PHASE_ICON_COLOR[p.state]}`}
                aria-hidden="true"
              >
                <Icon />
              </span>
              {p.label}
            </div>
          );
        })}
      </div>

      <div className="border-ai-accent/28 bg-ai-accent/6 flex gap-2.5 rounded-[calc(var(--radius)*0.8)] border p-3.5 text-[12.5px] leading-[1.65]">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ai-accent mt-0.5 flex-none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.6v5l3 1.7" />
        </svg>
        <span className="text-muted-foreground">
          <strong className="text-foreground font-semibold">Bạn có thể rời trang.</strong> Kế hoạch
          đã được lưu ở trạng thái nháp; phân tích chạy nền và sẽ hiện trong danh sách kế hoạch khi
          xong. Không cần mở trang này.
        </span>
      </div>
    </div>
  );
}
