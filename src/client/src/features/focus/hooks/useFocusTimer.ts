import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusSessionSnapshot, PomodoroConfig, PomodoroPhase } from '../types/focus.types';

const SNAPSHOT_KEY = 'recall.focusSession';
const SNAPSHOT_INTERVAL_MS = 10000;

/** Kẹp một trường config về miền hợp lệ + số nguyên. Sàn phòng thủ CUỐI của engine: dù panel đã
 *  kẹp `draft`, engine tuyệt đối không tin config ngoài miền (cycles=0 → `%0`=NaN; work=0 → chuyển
 *  lượt mỗi giây; cycles khổng lồ → render triệu pip / treo tab). */
function clampConfigField(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function readFocusSessionSnapshot(): FocusSessionSnapshot | null {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FocusSessionSnapshot;
  } catch {
    return null;
  }
}

export function clearFocusSessionSnapshot(): void {
  localStorage.removeItem(SNAPSHOT_KEY);
}

/** Bíp ngắn qua Web Audio API — không cần asset nhị phân đi kèm. */
function playChime(): void {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.6);
    oscillator.onended = () => void ctx.close();
  } catch {
    // Thiết bị không hỗ trợ Web Audio — tín hiệu thị giác (toast) vẫn còn.
  }
}

function phaseDurationMs(phase: PomodoroPhase, config: PomodoroConfig): number {
  const minutes =
    phase === 'work'
      ? config.work
      : phase === 'short_break'
        ? config.short_break
        : config.long_break;
  return minutes * 60 * 1000;
}

function phaseAnnouncement(
  phase: PomodoroPhase,
  pomodorosCompleted: number,
  cycles: number
): string {
  if (phase === 'work')
    return `Bắt đầu lượt tập trung. Pomodoro ${pomodorosCompleted + 1} trên ${cycles}.`;
  if (phase === 'long_break') return 'Hết lượt cuối — vào giờ nghỉ dài.';
  return 'Hết lượt — vào giờ nghỉ ngắn.';
}

interface AwayInfo {
  leftAt: number;
  durationMs: number;
}

type RunState = 'running' | 'paused' | 'away';

interface TimerState {
  phase: PomodoroPhase;
  runState: RunState;
  pomodorosCompleted: number;
  awayCount: number;
  strictMode: boolean;
  config: PomodoroConfig;
  awayInfo: AwayInfo | null;
  announcement: string;
  // Số hiển thị — chỉ được TÍNH LẠI (từ các ref bookkeeping bên dưới + `Date.now()`) bên trong
  // effect/handler rồi ghi vào state qua `commit()`. Render chỉ đọc field state, không bao giờ
  // đọc `.current` của ref — đó là quy tắc `react-hooks/refs` (ESLint), và cũng là lý do state
  // này tồn tại thay vì trả thẳng kết quả tính từ ref như bản đầu.
  phaseElapsedMs: number;
  phaseTargetMs: number;
  focusedMs: number;
  awayTotalMs: number;
}

interface UseFocusTimerOptions {
  sessionId: string;
  /** Mốc bắt đầu THẬT của phiên (server trả về lúc `POST /focus-sessions`), không phải lúc ghi snapshot. */
  startedAt: string;
  planId: string | null;
  conceptIds: string[];
  conceptName: string;
  /** Chủ của phiên, để snapshot khôi phục không lẫn sang tài khoản khác trên cùng trình duyệt.
   *  Truyền từ trên xuống thay vì tự gọi `useAuth()` ở đây — hook này thuần bộ đếm giờ, kéo
   *  AuthContext vào sẽ buộc mọi test render nó phải bọc `AuthProvider`. */
  userId: string | null;
  initialConfig: PomodoroConfig;
  initialStrictMode: boolean;
}

export interface UseFocusTimerReturn {
  phase: PomodoroPhase;
  phaseElapsedMs: number;
  phaseTargetMs: number;
  focusedMs: number;
  pomodorosCompleted: number;
  awayCount: number;
  awayTotalMs: number;
  runState: RunState;
  strictMode: boolean;
  config: PomodoroConfig;
  announcement: string;
  updateConfig: (patch: Partial<PomodoroConfig>) => void;
  pause: () => void;
  resume: () => void;
  skipBreak: () => void;
  awayInfo: AwayInfo | null;
  acknowledgeAway: (turnOffStrict: boolean) => void;
  getFinalStats: () => { focusedSeconds: number; awayCount: number; pomodorosCompleted: number };
}

/** Ghép ba số hiển thị từ mốc `Date.now()` hiện tại + phần đã "đóng băng" trong ref. Hàm thuần,
 *  chỉ được gọi bên trong effect/handler (không bao giờ trong thân render). */
function computeLiveMs(
  now: number,
  phase: PomodoroPhase,
  runState: RunState,
  phaseAccumulatedMs: number,
  focusedAccumulatedMs: number,
  awayAccumulatedMs: number,
  runSegmentStart: number | null,
  awayStart: number | null
): { phaseElapsedMs: number; focusedMs: number; awayTotalMs: number } {
  const liveSegmentMs =
    runState === 'running' && runSegmentStart !== null ? now - runSegmentStart : 0;
  return {
    phaseElapsedMs: phaseAccumulatedMs + liveSegmentMs,
    focusedMs: focusedAccumulatedMs + (phase === 'work' ? liveSegmentMs : 0),
    awayTotalMs:
      awayAccumulatedMs + (runState === 'away' && awayStart !== null ? now - awayStart : 0),
  };
}

/**
 * Bộ máy đồng hồ Pomodoro của một phiên đang chạy (FS-01).
 *
 * Ràng buộc cốt lõi: KHÔNG dùng số lần `setInterval` tick để tính giờ — tab nền bị trình
 * duyệt throttle sau ~25 phút. Mọi con số hiển thị đọc `Date.now() - runSegmentStart` tại
 * thời điểm effect/handler chạy (không phải trong thân render — xem `computeLiveMs`);
 * `setInterval(1s)` chỉ trigger tính lại, không cộng dồn gì. Nhờ vậy dù interval bị delay
 * (tab nền, máy ngủ), lần tick kế tiếp vẫn tính ra đúng thời gian thực đã trôi qua thay vì
 * đếm thiếu.
 */
export function useFocusTimer(options: UseFocusTimerOptions): UseFocusTimerReturn {
  const {
    sessionId,
    startedAt,
    planId,
    conceptIds,
    conceptName,
    userId,
    initialConfig,
    initialStrictMode,
  } = options;

  const [state, setState] = useState<TimerState>(() => ({
    phase: 'work',
    runState: 'running',
    pomodorosCompleted: 0,
    awayCount: 0,
    strictMode: initialStrictMode,
    config: initialConfig,
    awayInfo: null,
    announcement: '',
    phaseElapsedMs: 0,
    phaseTargetMs: phaseDurationMs('work', initialConfig),
    focusedMs: 0,
    awayTotalMs: 0,
  }));

  // Mirror để đọc trong callback/effect mà không dính closure cũ của `state` — KHÔNG bao giờ
  // đọc trong thân render (đó vẫn phải qua `state` ở trên).
  const liveRef = useRef(state);
  useEffect(() => {
    liveRef.current = state;
  }, [state]);

  // "Đã đóng băng" — ms tích lũy của lượt hiện tại / tổng thời gian tập trung / tổng thời gian
  // vắng mặt, TRƯỚC đoạn đang chạy hiện tại. Chỉ đọc/ghi trong effect/handler.
  const phaseAccumulatedMsRef = useRef(0);
  const focusedAccumulatedMsRef = useRef(0);
  const awayAccumulatedMsRef = useRef(0);
  // `Date.now()` là hàm không thuần — không được gọi trong thân render (kể cả bên trong
  // initializer của `useRef`, React Compiler coi đó vẫn là "trong lúc render"). Khởi tạo
  // `null`, gán mốc thật ở effect mount-once ngay dưới; độ trễ vài mili-giây trước khi effect
  // chạy không ảnh hưởng gì tới một đồng hồ Pomodoro.
  const runSegmentStartRef = useRef<number | null>(null);
  const awayStartRef = useRef<number | null>(null);

  useEffect(() => {
    runSegmentStartRef.current = Date.now();
  }, []);

  const commit = useCallback((next: TimerState) => {
    liveRef.current = next;
    setState(next);
  }, []);

  /** Cộng đoạn đang chạy (nếu có) vào các ref tích lũy, rồi neo lại mốc `now`. */
  const commitRunningSegment = useCallback((now: number, phase: PomodoroPhase) => {
    const start = runSegmentStartRef.current;
    if (start === null) return;
    // H1 — KẸP phần cộng vào không vượt quá thời lượng còn lại của lượt. Một tick bị trễ (tab nền
    // bị throttle, hoặc máy ngủ/OS-suspend khi trang VẪN visible → không có `visibilitychange` để
    // đóng băng chế độ nghiêm ngặt) trả `now - start` tới hàng giờ; nhưng một lượt `work` 25' không
    // thể "tập trung" quá 25'. Phần dư là thời gian trôi ngoài ý muốn, KHÔNG phải tập trung — cắt
    // bỏ để không ghi phút ảo vào lịch sử (server guard `focusedSeconds ≤ elapsed` cho qua vì
    // wall-clock cũng trôi bằng ngần đó). Kẹp `phaseAccumulated` về `phaseTargetMs` cũng giữ
    // `phaseElapsed` hiển thị không vượt trần. Miền chạy bình thường không bị hụt: mỗi lượt chỉ
    // commit ở ranh giới/pause/kết thúc, `remaining` luôn ≥ đoạn thực đã chạy.
    const rawDelta = now - start;
    const remainingInPhase = Math.max(
      0,
      liveRef.current.phaseTargetMs - phaseAccumulatedMsRef.current
    );
    const delta = Math.min(rawDelta, remainingInPhase);
    phaseAccumulatedMsRef.current += delta;
    if (phase === 'work') {
      focusedAccumulatedMsRef.current += delta;
    }
    runSegmentStartRef.current = now;
  }, []);

  const writeSnapshot = useCallback(
    (now: number) => {
      const prev = liveRef.current;
      const { focusedMs } = computeLiveMs(
        now,
        prev.phase,
        prev.runState,
        phaseAccumulatedMsRef.current,
        focusedAccumulatedMsRef.current,
        awayAccumulatedMsRef.current,
        runSegmentStartRef.current,
        awayStartRef.current
      );
      const snapshot: FocusSessionSnapshot = {
        sessionId,
        startedAt,
        focusedMs,
        awayCount: prev.awayCount,
        pomodorosCompleted: prev.pomodorosCompleted,
        conceptName,
        planId,
        conceptIds,
        userId,
      };
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    },
    [sessionId, startedAt, conceptName, planId, conceptIds, userId]
  );

  const transitionPhase = useCallback(
    (now: number) => {
      const prev = liveRef.current;
      commitRunningSegment(now, prev.phase);
      const finishedPhase = prev.phase;
      let nextPhase: PomodoroPhase;
      let nextPomodorosCompleted = prev.pomodorosCompleted;

      if (finishedPhase === 'work') {
        nextPomodorosCompleted += 1;
        nextPhase =
          nextPomodorosCompleted % prev.config.cycles === 0 ? 'long_break' : 'short_break';
      } else {
        nextPhase = 'work';
      }

      const announcement = phaseAnnouncement(nextPhase, nextPomodorosCompleted, prev.config.cycles);
      phaseAccumulatedMsRef.current = 0;
      const phaseTargetMs = phaseDurationMs(nextPhase, prev.config);

      if (prev.config.sound) playChime();
      // M6: KHÔNG `toast.info(announcement)` nữa — toast của sonner cũng có vùng aria-live, cộng
      // với vùng `role="status"` ở RunningSession là đọc đôi mỗi lần đổi lượt. Đổi lượt đã được
      // báo qua vùng status đó (một kênh duy nhất) + chime + cả panel đổi hẳn sang giao diện nghỉ,
      // nên toast là thừa cả về thị giác lẫn trợ năng.

      const live = computeLiveMs(
        now,
        nextPhase,
        prev.runState,
        phaseAccumulatedMsRef.current,
        focusedAccumulatedMsRef.current,
        awayAccumulatedMsRef.current,
        runSegmentStartRef.current,
        awayStartRef.current
      );
      commit({
        ...prev,
        phase: nextPhase,
        pomodorosCompleted: nextPomodorosCompleted,
        announcement,
        phaseTargetMs,
        ...live,
      });
      writeSnapshot(now);
    },
    [commitRunningSegment, commit, writeSnapshot]
  );

  // Vòng tick 1s: tính lại số hiển thị + kiểm tra hết lượt. Cũng chạy lại ngay khi tab trở
  // nên visible (interval bị throttle khi ẩn, phải tự bù một nhịp để số liệu không đứng hình).
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const prev = liveRef.current;
      if (prev.runState === 'running') {
        const liveSegmentMs =
          runSegmentStartRef.current !== null ? now - runSegmentStartRef.current : 0;
        if (phaseAccumulatedMsRef.current + liveSegmentMs >= prev.phaseTargetMs) {
          transitionPhase(now);
          return;
        }
      }
      const live = computeLiveMs(
        now,
        prev.phase,
        prev.runState,
        phaseAccumulatedMsRef.current,
        focusedAccumulatedMsRef.current,
        awayAccumulatedMsRef.current,
        runSegmentStartRef.current,
        awayStartRef.current
      );
      commit({ ...prev, ...live });
    };
    const interval = setInterval(check, 1000);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [transitionPhase, commit]);

  // Snapshot định kỳ ~10s cho UC-03 E2 (khôi phục phiên gián đoạn).
  useEffect(() => {
    const interval = setInterval(() => writeSnapshot(Date.now()), SNAPSHOT_INTERVAL_MS);
    writeSnapshot(Date.now());
    return () => clearInterval(interval);
  }, [writeSnapshot]);

  // Chế độ nghiêm ngặt: rời tab = một lần "pause" do trình duyệt phát (kỹ thuật thiết kế
  // trong issue), không phải một nhánh trạng thái riêng.
  useEffect(() => {
    const onVisibilityChange = () => {
      const prev = liveRef.current;
      if (!prev.strictMode) return;
      const now = Date.now();
      const awayAnnouncement = 'Đồng hồ tập trung đã dừng vì bạn rời tab.';
      if (document.hidden) {
        // M2: rời tab trong GIỜ NGHỈ không tính là "rời tab" — chỉ lượt `work` mới có thời gian
        // tập trung để bảo vệ. Nghỉ vốn không tính vào focused, rời đi lúc đó là tự do.
        if (prev.phase !== 'work') return;
        if (prev.runState === 'running') {
          commitRunningSegment(now, prev.phase);
          runSegmentStartRef.current = null;
          awayStartRef.current = now;
          const live = computeLiveMs(
            now,
            prev.phase,
            'away',
            phaseAccumulatedMsRef.current,
            focusedAccumulatedMsRef.current,
            awayAccumulatedMsRef.current,
            null,
            now
          );
          commit({
            ...prev,
            runState: 'away',
            awayCount: prev.awayCount + 1,
            awayInfo: null,
            announcement: awayAnnouncement,
            ...live,
          });
          writeSnapshot(now);
        } else if (prev.runState === 'away' && awayStartRef.current === null) {
          // M7: rời tab LẦN NỮA khi panel "đã dừng" đang mở (đồng hồ đã đóng băng từ lần trước).
          // Vẫn là một lần rời riêng: tăng đếm, mở lại mốc away, và xoá `awayInfo` để khi quay lại
          // panel phản ánh lần vắng NÀY chứ không giữ nguyên số liệu cũ của lần đầu.
          awayStartRef.current = now;
          const live = computeLiveMs(
            now,
            prev.phase,
            'away',
            phaseAccumulatedMsRef.current,
            focusedAccumulatedMsRef.current,
            awayAccumulatedMsRef.current,
            null,
            now
          );
          commit({ ...prev, awayCount: prev.awayCount + 1, awayInfo: null, ...live });
          writeSnapshot(now);
        }
      } else {
        if (prev.runState !== 'away' || awayStartRef.current === null) return;
        const leftAt = awayStartRef.current;
        const durationMs = now - leftAt;
        awayAccumulatedMsRef.current += durationMs;
        awayStartRef.current = null;
        // Đồng hồ VẪN đứng yên (runState còn 'away') cho tới khi người dùng xác nhận ở hộp
        // thoại (acknowledgeAway) — quay lại tab không tự động chạy tiếp.
        const live = computeLiveMs(
          now,
          prev.phase,
          'away',
          phaseAccumulatedMsRef.current,
          focusedAccumulatedMsRef.current,
          awayAccumulatedMsRef.current,
          null,
          null
        );
        commit({ ...prev, awayInfo: { leftAt, durationMs }, ...live });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [commit, commitRunningSegment, writeSnapshot]);

  const pause = useCallback(() => {
    const prev = liveRef.current;
    if (prev.runState !== 'running') return;
    const now = Date.now();
    commitRunningSegment(now, prev.phase);
    runSegmentStartRef.current = null;
    const live = computeLiveMs(
      now,
      prev.phase,
      'paused',
      phaseAccumulatedMsRef.current,
      focusedAccumulatedMsRef.current,
      awayAccumulatedMsRef.current,
      null,
      awayStartRef.current
    );
    // M6: báo trạng thái cho trình đọc màn hình — vùng `role="status"` ở RunningSession đọc
    // `announcement`; trước đây chỉ đổi lượt mới báo, pause/resume/away im lặng.
    commit({ ...prev, runState: 'paused', announcement: 'Đã tạm dừng.', ...live });
  }, [commitRunningSegment, commit]);

  const resume = useCallback(() => {
    const prev = liveRef.current;
    if (prev.runState !== 'paused') return;
    const now = Date.now();
    runSegmentStartRef.current = now;
    const live = computeLiveMs(
      now,
      prev.phase,
      'running',
      phaseAccumulatedMsRef.current,
      focusedAccumulatedMsRef.current,
      awayAccumulatedMsRef.current,
      now,
      awayStartRef.current
    );
    commit({ ...prev, runState: 'running', announcement: 'Đã tiếp tục.', ...live });
  }, [commit]);

  const acknowledgeAway = useCallback(
    (turnOffStrict: boolean) => {
      const prev = liveRef.current;
      const now = Date.now();
      runSegmentStartRef.current = now;
      const live = computeLiveMs(
        now,
        prev.phase,
        'running',
        phaseAccumulatedMsRef.current,
        focusedAccumulatedMsRef.current,
        awayAccumulatedMsRef.current,
        now,
        null
      );
      commit({
        ...prev,
        runState: 'running',
        awayInfo: null,
        strictMode: turnOffStrict ? false : prev.strictMode,
        announcement: 'Đã tiếp tục.',
        ...live,
      });
    },
    [commit]
  );

  const skipBreak = useCallback(() => {
    if (liveRef.current.phase === 'work') return;
    transitionPhase(Date.now());
  }, [transitionPhase]);

  /**
   * Chỉ đổi `config` (draft) — độ dài lượt ĐANG chạy không đổi vì `phaseTargetMs` của state đã
   * chốt lúc lượt bắt đầu; giá trị mới chỉ được đọc lại ở `transitionPhase` kế tiếp
   * (`phaseDurationMs(nextPhase, prev.config)`), đúng "áp từ lượt kế tiếp".
   * `cycles`/`sound` không cần tách applied/draft: cả hai chỉ được đọc tại đúng thời điểm
   * chuyển lượt, nên sửa bất cứ lúc nào trước đó đã tự nhiên "áp từ lượt kế tiếp".
   */
  const updateConfig = useCallback(
    (patch: Partial<PomodoroConfig>) => {
      const prev = liveRef.current;
      const merged = { ...prev.config, ...patch };
      // H3 — sàn phòng thủ CUỐI: engine không tin config ngoài miền dù panel đã kẹp `draft`.
      const safeConfig: PomodoroConfig = {
        work: clampConfigField(merged.work, 1, 120),
        short_break: clampConfigField(merged.short_break, 1, 60),
        long_break: clampConfigField(merged.long_break, 1, 60),
        cycles: clampConfigField(merged.cycles, 1, 10),
        sound: merged.sound,
      };
      commit({ ...prev, config: safeConfig });
    },
    [commit]
  );

  const getFinalStats = useCallback(() => {
    const prev = liveRef.current;
    const now = Date.now();
    commitRunningSegment(now, prev.phase);
    runSegmentStartRef.current = prev.runState === 'running' ? now : null;
    // H1 — trần phòng thủ lớp hai: thời gian tập trung không thể vượt (a) đồng hồ treo tường từ
    // lúc phiên bắt đầu, (b) trần cứng 8h của server (`focusedSeconds` max 28800). Kẹp per-phase ở
    // `commitRunningSegment` đã chặn ca máy ngủ tại nguồn (nên cả snapshot lẫn số này đều sạch);
    // đây chỉ là lưới cuối cho mọi ca còn sót.
    const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
    const focusedSeconds = Math.min(
      Math.floor(focusedAccumulatedMsRef.current / 1000),
      elapsedSeconds,
      28800
    );
    return {
      focusedSeconds,
      awayCount: prev.awayCount,
      pomodorosCompleted: prev.pomodorosCompleted,
    };
  }, [commitRunningSegment, startedAt]);

  return {
    phase: state.phase,
    phaseElapsedMs: state.phaseElapsedMs,
    phaseTargetMs: state.phaseTargetMs,
    focusedMs: state.focusedMs,
    pomodorosCompleted: state.pomodorosCompleted,
    awayCount: state.awayCount,
    awayTotalMs: state.awayTotalMs,
    runState: state.runState,
    strictMode: state.strictMode,
    config: state.config,
    announcement: state.announcement,
    updateConfig,
    pause,
    resume,
    skipBreak,
    awayInfo: state.awayInfo,
    acknowledgeAway,
    getFinalStats,
  };
}
