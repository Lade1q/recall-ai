import {
  computeStreakDays,
  getStreakLookbackStartUtc,
  getVnTomorrowStartUtc,
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

describe('getVnTomorrowStartUtc', () => {
  // Mốc "hoãn đến mai" của DB-09 (#233). Cả hai ca dưới đây đều sai nếu tính bằng `now + 24h`.
  it('returns 00:00 of the next VN day when now is early morning VN (00:30)', () => {
    // 00:30 VN ngày 2026-08-05 = 17:30 UTC ngày 2026-08-04 — lớp lỗi 0h-7h mà #200 đã chạm.
    const earlyMorningVn = new Date('2026-08-04T17:30:00.000Z');
    const tomorrow = getVnTomorrowStartUtc(earlyMorningVn);
    expect(toVnDateKey(tomorrow)).toBe('2026-08-06');
    expect(tomorrow.toISOString()).toBe('2026-08-05T17:00:00.000Z'); // 00:00 VN ngày 06
  });

  it('returns 00:00 of the next VN day when now is late evening VN (23:30)', () => {
    // 23:30 VN ngày 2026-08-05 = 16:30 UTC cùng ngày. `now + 24h` sẽ ra 23:30 hôm sau — trễ gần
    // trọn một ngày đáng lẽ được nhắc.
    const lateEveningVn = new Date('2026-08-05T16:30:00.000Z');
    const tomorrow = getVnTomorrowStartUtc(lateEveningVn);
    expect(toVnDateKey(tomorrow)).toBe('2026-08-06');
    expect(tomorrow.toISOString()).toBe('2026-08-05T17:00:00.000Z'); // 00:00 VN ngày 06
  });

  it('is strictly in the future — the snoozed item leaves /today for the rest of the day', () => {
    const lateEveningVn = new Date('2026-08-05T16:59:59.000Z'); // 23:59:59 VN
    expect(getVnTomorrowStartUtc(lateEveningVn).getTime()).toBeGreaterThan(lateEveningVn.getTime());
  });

  it('crosses a month boundary', () => {
    const lastDayOfMonthVn = new Date('2026-08-31T05:00:00.000Z'); // 12:00 VN ngày 31/08
    expect(toVnDateKey(getVnTomorrowStartUtc(lastDayOfMonthVn))).toBe('2026-09-01');
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
