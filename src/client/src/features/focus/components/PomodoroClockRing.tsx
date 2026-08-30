import type { PomodoroConfig } from '../types/focus.types';
import { formatClock } from '../utils/format';

interface PomodoroClockRingProps {
  elapsedMs: number;
  targetMs: number;
  pomodorosCompleted: number;
  config: PomodoroConfig;
}

const SIZE = 196;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Vòng đồng hồ đếm ngược lớn + tiến độ Pomodoro (mockup: `.clock` — `.ring` + `.meter`).
 * Chỉ dùng ở trạng thái ② Đang chạy (lượt `work`) — trạng thái Chưa bắt đầu / Nghỉ giải lao
 * trong mockup chỉ hiện chữ số tĩnh (`.panel__k--muted`), không có vòng SVG này.
 */
export function PomodoroClockRing({
  elapsedMs,
  targetMs,
  pomodorosCompleted,
  config,
}: PomodoroClockRingProps) {
  // Phòng thủ: `cycles` khổng lồ → `Array.from` dựng triệu pip treo tab; `cycles=0` → `%0`=NaN.
  // Engine đã kẹp config, đây là lưới cuối cho chính component render.
  const cycles = Number.isFinite(config.cycles)
    ? Math.min(10, Math.max(1, Math.floor(config.cycles)))
    : 1;
  const remainingMs = Math.max(0, targetMs - elapsedMs);
  const progress = targetMs > 0 ? Math.min(1, elapsedMs / targetMs) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  // Vị trí trong chu kỳ hiện tại (1-based) — tua lại mỗi khi vượt `cycles`, khớp cách
  // `transitionPhase` tự cuốn vòng bằng phép chia dư.
  const positionInCycle = pomodorosCompleted % cycles;
  const currentPomodoroNumber = positionInCycle + 1;
  const breakMinutesAfterThisTurn =
    currentPomodoroNumber === cycles ? config.long_break : config.short_break;

  return (
    <section className="flex flex-col items-center gap-[15px]" aria-label="Đồng hồ phiên học">
      <div
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
        role="timer"
        aria-live="off"
      >
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--focus-session)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-[44px] font-semibold tabular-nums leading-none tracking-[-0.03em]">
            {formatClock(remainingMs)}
          </div>
          <div className="text-muted-foreground mt-1.5 text-[11px] uppercase tracking-[0.08em]">
            Còn lại
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
        <span className="flex shrink-0 gap-1" aria-hidden="true">
          {Array.from({ length: cycles }, (_, index) => {
            const done = index < positionInCycle;
            const now = index === positionInCycle;
            return (
              <span
                key={index}
                className="h-1 w-5 rounded-full"
                style={{
                  background: done || now ? 'var(--focus-session)' : 'var(--border)',
                  boxShadow: now
                    ? '0 0 0 3px color-mix(in oklch, var(--focus-session) 18%, transparent)'
                    : undefined,
                }}
              />
            );
          })}
        </span>
        <span className="text-muted-foreground text-xs">
          Pomodoro {currentPomodoroNumber} / {cycles} · nghỉ {breakMinutesAfterThisTurn} phút sau
          lượt này
        </span>
      </div>
    </section>
  );
}
