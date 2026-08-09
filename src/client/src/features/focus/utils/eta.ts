import type { PomodoroConfig, PomodoroPhase } from '../types/focus.types';

export interface SessionEta {
  /** Số lượt `work` còn lại trong bộ hiện tại, KHÔNG tính lượt đang chạy (nếu có). */
  turnsLeft: number;
  /** Mốc giờ dự kiến lượt `work` cuối của bộ hiện tại kết thúc (chưa tính nghỉ dài sau đó). */
  finishAt: Date;
}

/**
 * Ước lượng cho panel cấu hình Pomodoro (AC ⑨): "Còn N lượt — phiên xong khoảng HH:mm."
 * "Xong" ở đây là lúc lượt `work` cuối của bộ (`cycles`) kết thúc, KHÔNG cộng thêm nghỉ dài
 * sau đó — nghỉ dài là tùy chọn, học viên có thể "Kết thúc phiên học" ngay khi vừa xong lượt.
 */
export function estimateSessionEta(
  now: number,
  phase: PomodoroPhase,
  phaseElapsedMs: number,
  phaseTargetMs: number,
  pomodorosCompleted: number,
  config: PomodoroConfig
): SessionEta {
  // Phòng thủ: dù panel đã kẹp `draft`, không tin thẳng config để tính preview — `cycles=0` cho
  // `% 0` = NaN → `new Date(now+NaN)` = "Invalid Date", `cycles` khổng lồ cho vòng lặp treo tab.
  // Kẹp về miền hợp lệ CHỈ để tính hiển thị (engine có sàn riêng).
  const cycles = Number.isFinite(config.cycles)
    ? Math.min(10, Math.max(1, Math.floor(config.cycles)))
    : 1;
  const workMs = Math.max(0, Number.isFinite(config.work) ? config.work : 0) * 60000;
  const shortBreakMs =
    Math.max(0, Number.isFinite(config.short_break) ? config.short_break : 0) * 60000;

  const positionInCycle = pomodorosCompleted % cycles;
  const remainingInPhaseMs = Math.max(0, phaseTargetMs - phaseElapsedMs);

  let turnsLeft: number;
  let remainingMs = remainingInPhaseMs;

  if (phase === 'work') {
    turnsLeft = cycles - (positionInCycle + 1);
    for (let i = 0; i < turnsLeft; i++) {
      remainingMs += shortBreakMs + workMs;
    }
  } else {
    turnsLeft = cycles - positionInCycle;
    for (let i = 0; i < turnsLeft; i++) {
      if (i > 0) remainingMs += shortBreakMs;
      remainingMs += workMs;
    }
  }

  return { turnsLeft, finishAt: new Date(now + remainingMs) };
}
