import { describe, expect, it } from 'vitest';
import { estimateSessionEta } from './eta';
import type { PomodoroConfig } from '../types/focus.types';

const baseConfig: PomodoroConfig = {
  work: 25,
  short_break: 5,
  long_break: 15,
  cycles: 4,
  sound: false,
};

const MIN = 60000;
const NOW = 1_700_000_000_000; // fixed epoch ms, keeps finishAt deterministic

describe('estimateSessionEta', () => {
  it('normal work phase: turnsLeft is cycles-1 and finishAt is a valid Date', () => {
    const eta = estimateSessionEta(NOW, 'work', 0, 25 * MIN, 0, baseConfig);

    expect(eta.turnsLeft).toBe(3); // cycles(4) - 1
    expect(eta.finishAt).toBeInstanceOf(Date);
    expect(Number.isNaN(eta.finishAt.getTime())).toBe(false);
  });

  it('DEFENSIVE: config.cycles = 0 must not crash and must not yield an Invalid Date', () => {
    const eta = estimateSessionEta(NOW, 'work', 0, 25 * MIN, 0, { ...baseConfig, cycles: 0 });

    expect(Number.isNaN(eta.finishAt.getTime())).toBe(false);
    expect(Number.isFinite(eta.turnsLeft)).toBe(true);
  });

  it('config.cycles = 999999 completes without hanging and returns a valid, finite ETA', () => {
    const start = Date.now();
    const eta = estimateSessionEta(NOW, 'work', 0, 25 * MIN, 0, { ...baseConfig, cycles: 999999 });
    const elapsed = Date.now() - start;

    // Clamped internally to a small ceiling, so the loop must return near-instantly.
    expect(elapsed).toBeLessThan(1000);
    expect(Number.isNaN(eta.finishAt.getTime())).toBe(false);
    expect(Number.isFinite(eta.turnsLeft)).toBe(true);
  });

  it('short_break phase: turnsLeft is computed and finishAt is valid', () => {
    // pomodorosCompleted 1 -> positionInCycle 1 -> turnsLeft = cycles(4) - 1 = 3
    const eta = estimateSessionEta(NOW, 'short_break', 0, 5 * MIN, 1, baseConfig);

    expect(eta.turnsLeft).toBe(3);
    expect(Number.isFinite(eta.turnsLeft)).toBe(true);
    expect(eta.finishAt).toBeInstanceOf(Date);
    expect(Number.isNaN(eta.finishAt.getTime())).toBe(false);
  });
});
