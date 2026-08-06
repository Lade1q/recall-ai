import {
  computeStreakDays,
  getStreakLookbackStartUtc,
  getVnWeekStartUtc,
  shiftVnDateKey,
  STREAK_LOOKBACK_DAYS,
  toVnDateKey,
} from '../utils/dashboard-stats';

describe('toVnDateKey', () => {
  // VN = UTC+7 -> 17:00 UTC là ranh giới đổi ngày VN (00:00 hôm sau).
  it('rolls over to the next VN day exactly at 17:00:00 UTC', () => {
    expect(toVnDateKey(new Date('2026-08-04T17:00:00.000Z'))).toBe('2026-08-05');
  });

  it('stays on the previous VN day one second before the boundary', () => {
    expect(toVnDateKey(new Date('2026-08-04T16:59:59.000Z'))).toBe('2026-08-04');
  });

  it('formats a mid-day UTC time straightforwardly', () => {
    expect(toVnDateKey(new Date('2026-08-05T03:00:00.000Z'))).toBe('2026-08-05');
  });
});

describe('shiftVnDateKey', () => {
  it('shifts backward across a month boundary', () => {
    expect(shiftVnDateKey('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('shifts forward across a year boundary', () => {
    expect(shiftVnDateKey('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('is a no-op for delta 0', () => {
    expect(shiftVnDateKey('2026-08-05', 0)).toBe('2026-08-05');
  });
});

describe('getVnWeekStartUtc', () => {
  it('returns the Monday of the same week when now falls on a Sunday (VN time)', () => {
    // 2026-08-09 là Chủ nhật (VN). 10:00 VN = 03:00 UTC cùng ngày.
    const sundayVn = new Date('2026-08-09T03:00:00.000Z');
    const weekStart = getVnWeekStartUtc(sundayVn);
    expect(toVnDateKey(weekStart)).toBe('2026-08-03'); // thứ 2 của tuần đó
    expect(weekStart.toISOString()).toBe('2026-08-02T17:00:00.000Z'); // 00:00 VN thứ 2 = 17:00 UTC CN trước
  });

  it('returns the same instant when now is exactly 00:00:01 VN on a Monday', () => {
    // 2026-08-03 là thứ 2 (VN). 00:00:01 VN = 17:00:01 UTC ngày 2026-08-02.
    const mondayVn = new Date('2026-08-02T17:00:01.000Z');
    const weekStart = getVnWeekStartUtc(mondayVn);
    expect(weekStart.toISOString()).toBe('2026-08-02T17:00:00.000Z');
  });
});

describe('getStreakLookbackStartUtc', () => {
  it('returns a timestamp exactly STREAK_LOOKBACK_DAYS before now', () => {
    const now = new Date('2026-08-05T03:00:00.000Z');
    const start = getStreakLookbackStartUtc(now);
    expect(now.getTime() - start.getTime()).toBe(STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe('computeStreakDays', () => {
  const NOW = new Date('2026-08-05T03:00:00.000Z'); // 2026-08-05 giờ VN

  it('returns 0 for no activity at all', () => {
    expect(computeStreakDays(new Set(), NOW)).toBe(0);
  });

  it('counts today alone as a 1-day streak', () => {
    expect(computeStreakDays(new Set(['2026-08-05']), NOW)).toBe(1);
  });

  it('stays "alive" counting from yesterday when today has no activity yet', () => {
    const activeDays = new Set(['2026-08-04', '2026-08-03']);
    expect(computeStreakDays(activeDays, NOW)).toBe(2);
  });

  it('stops at the first gap walking backward from today', () => {
    // 08-05, 08-04, 08-03 liên tiếp, rồi đứt (thiếu 08-02), có thêm 08-01 lẻ loi không tính.
    const activeDays = new Set(['2026-08-05', '2026-08-04', '2026-08-03', '2026-08-01']);
    expect(computeStreakDays(activeDays, NOW)).toBe(3);
  });

  it('returns 0 when neither today nor yesterday has activity, even with older activity present', () => {
    const activeDays = new Set(['2026-08-01', '2026-07-30']);
    expect(computeStreakDays(activeDays, NOW)).toBe(0);
  });
});
