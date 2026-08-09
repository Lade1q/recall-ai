import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFocusSessionSnapshot, useFocusTimer } from './useFocusTimer';
import type { PomodoroConfig } from '../types/focus.types';

const CONFIG: PomodoroConfig = {
  work: 25,
  short_break: 5,
  long_break: 15,
  cycles: 4,
  sound: false,
};
const START = new Date('2026-01-01T00:00:00.000Z');

function setup(config: PomodoroConfig = CONFIG, strictMode = true) {
  return renderHook(() =>
    useFocusTimer({
      sessionId: 'sess-1',
      startedAt: START.toISOString(),
      planId: 'plan-1',
      conceptIds: ['c-1'],
      conceptName: 'Array',
      userId: 'user-1',
      initialConfig: config,
      initialStrictMode: strictMode,
    })
  );
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const seconds = (ms: number) => Math.round(ms / 1000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  localStorage.clear();
});

afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useFocusTimer', () => {
  it('starts in a running work phase', () => {
    const { result } = setup();
    expect(result.current.phase).toBe('work');
    expect(result.current.runState).toBe('running');
    expect(result.current.phaseTargetMs).toBe(25 * 60_000);
    expect(result.current.focusedMs).toBe(0);
  });

  it('accrues focused time while running', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(10_000));
    expect(seconds(result.current.focusedMs)).toBe(10);
  });

  it('does not accrue focus while paused, and resumes cleanly', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(10_000));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(30_000));
    expect(seconds(result.current.focusedMs)).toBe(10);
    act(() => result.current.resume());
    act(() => vi.advanceTimersByTime(5_000));
    expect(seconds(result.current.focusedMs)).toBe(15);
  });

  it('transitions work -> short_break at the target and counts a pomodoro', () => {
    const { result } = setup({ ...CONFIG, work: 1 });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.phase).toBe('short_break');
    expect(result.current.pomodorosCompleted).toBe(1);
  });

  // H1 — a wall-clock jump (machine sleep while the tab stays visible, so no visibilitychange)
  // must not credit the gap as focus. commitRunningSegment clamps to the phase remainder.
  it('clamps focused time to one phase when the clock jumps without ticks (sleep)', () => {
    const { result } = setup({ ...CONFIG, work: 1 });
    act(() => {
      vi.setSystemTime(START.getTime() + 2 * 60 * 60 * 1000); // +2h, no ticks fired
      vi.advanceTimersByTime(1000); // one tick sees the huge gap
    });
    const stats = result.current.getFinalStats();
    expect(stats.focusedSeconds).toBeLessThanOrEqual(61); // ~1 work phase, not 7200s
    expect(stats.focusedSeconds).toBeGreaterThanOrEqual(59);
    // snapshot path is clean too (clamp happens at source, before writeSnapshot)
    expect(readFocusSessionSnapshot()!.focusedMs).toBeLessThanOrEqual(61_000);
  });

  it('caps getFinalStats focusedSeconds at the wall-clock elapsed and 8h', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(30_000));
    const stats = result.current.getFinalStats();
    const elapsed = 30; // seconds since START
    expect(stats.focusedSeconds).toBeLessThanOrEqual(elapsed);
    expect(stats.focusedSeconds).toBeLessThanOrEqual(28_800);
  });

  it('clamps out-of-range config in the engine', () => {
    const { result } = setup();
    act(() => result.current.updateConfig({ cycles: 0, work: 999_999 }));
    expect(result.current.config.cycles).toBe(1);
    expect(result.current.config.work).toBe(120);
    act(() => result.current.updateConfig({ short_break: -5 }));
    expect(result.current.config.short_break).toBe(1);
  });

  it('writes a per-user snapshot without a legacy updatedAt field', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(11_000)); // past the 10s snapshot interval
    const snap = readFocusSessionSnapshot();
    expect(snap?.userId).toBe('user-1');
    expect(snap?.sessionId).toBe('sess-1');
    expect(Object.prototype.hasOwnProperty.call(snap, 'updatedAt')).toBe(false);
    // focusedMs kept in sync (~11s)
    expect(seconds(result.current.focusedMs)).toBe(11);
  });

  it('freezes focus and counts an away when hidden during strict work, resumes on acknowledge', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(5_000));
    act(() => setHidden(true));
    expect(result.current.runState).toBe('away');
    expect(result.current.awayCount).toBe(1);
    const frozen = result.current.focusedMs;
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.focusedMs).toBe(frozen); // clock frozen while away
    act(() => setHidden(false));
    expect(result.current.runState).toBe('away'); // stays away until acknowledged
    expect(result.current.awayInfo).not.toBeNull();
    act(() => result.current.acknowledgeAway(false));
    expect(result.current.runState).toBe('running');
  });

  // M2 — leaving during a break is free (no time to protect).
  it('does not count an away when hidden during a break', () => {
    const { result } = setup({ ...CONFIG, work: 1 });
    act(() => vi.advanceTimersByTime(60_000)); // finish work -> break
    expect(result.current.phase).toBe('short_break');
    act(() => setHidden(true));
    expect(result.current.awayCount).toBe(0);
    expect(result.current.runState).toBe('running');
  });

  // M7 — a second tab-leave while the away panel is open still counts.
  it('counts a second away that happens while the away panel is open', () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(5_000));
    act(() => setHidden(true)); // away #1
    act(() => setHidden(false)); // back, panel open (still away)
    expect(result.current.awayCount).toBe(1);
    act(() => setHidden(true)); // away #2 while panel open
    expect(result.current.awayCount).toBe(2);
    expect(result.current.awayInfo).toBeNull(); // panel reset for the new absence
  });

  it('does not treat a hidden tab as away when strict mode is off', () => {
    const { result } = setup(CONFIG, false);
    act(() => vi.advanceTimersByTime(5_000));
    act(() => setHidden(true));
    expect(result.current.runState).toBe('running');
    expect(result.current.awayCount).toBe(0);
  });
});
