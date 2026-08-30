import { describe, expect, it } from 'vitest';

import type { FocusSessionListItem } from '@/features/focus/types/focus.types';

import {
  dayLabel,
  formatDuration,
  groupFocusSessionsByDay,
  minutesTowardDayTotal,
} from './group-focus-by-day';

/** 27/07/2026 lúc 21:00 giờ địa phương. Mọi mốc dưới đây neo vào đây, không đọc đồng hồ máy. */
const NOW = new Date(2026, 6, 27, 21, 0, 0);

function session(overrides: Partial<FocusSessionListItem> = {}): FocusSessionListItem {
  return {
    id: 'fs-1',
    planId: 'plan-1',
    concepts: [{ id: 'c-1', name: 'Ngăn xếp' }],
    status: 'completed',
    durationMinutes: 25,
    focusedSeconds: 1500,
    awayCount: 0,
    pomodorosCompleted: 1,
    strictMode: false,
    startedAt: new Date(2026, 6, 27, 19, 5).toISOString(),
    endedAt: new Date(2026, 6, 27, 19, 30).toISOString(),
    ...overrides,
  };
}

describe('dayLabel', () => {
  it('gắn tiền tố "Hôm nay" cho ngày hiện tại', () => {
    expect(dayLabel(new Date(2026, 6, 27, 19, 5).toISOString(), NOW)).toBe('Hôm nay · 27/07');
  });

  it('chỉ in ngày cho các ngày khác', () => {
    expect(dayLabel(new Date(2026, 6, 26, 20, 50).toISOString(), NOW)).toBe('26/07');
  });

  it('so theo NGÀY chứ không theo khoảng 24 giờ — 00:05 hôm nay vẫn là "Hôm nay"', () => {
    // Cách nhau chưa tới 24h nhưng khác ngày, và cách nhau <24h nhưng cùng ngày: hai ca này
    // phân biệt được `startOfDay` thật với một phép trừ mốc thời gian.
    expect(dayLabel(new Date(2026, 6, 27, 0, 5).toISOString(), NOW)).toBe('Hôm nay · 27/07');
    expect(dayLabel(new Date(2026, 6, 26, 23, 55).toISOString(), NOW)).toBe('26/07');
  });

  it('ngày hỏng không ném, rơi vào nhóm riêng', () => {
    expect(dayLabel('không-phải-ngày', NOW)).toBe('Không rõ thời gian');
  });
});

describe('minutesTowardDayTotal', () => {
  it('phiên hoàn thành tính đủ durationMinutes', () => {
    expect(minutesTowardDayTotal(session({ durationMinutes: 25 }))).toBe(25);
  });

  it('phiên hủy KHÔNG tính vào tổng, kể cả khi focusedSeconds còn số thật', () => {
    // Hợp đồng: `durationMinutes = 0` cho phiên hủy (FS-01 Alt flow 4). `focusedSeconds` vẫn
    // giữ số thô — test khoá đúng chỗ này vì mockup cộng số thô đó vào tổng ngày.
    const cancelled = session({
      status: 'cancelled',
      durationMinutes: 0,
      focusedSeconds: 7 * 60,
    });
    expect(minutesTowardDayTotal(cancelled)).toBe(0);
  });
});

describe('groupFocusSessionsByDay', () => {
  it('gộp các phiên cùng ngày và cộng tổng phút', () => {
    const groups = groupFocusSessionsByDay(
      [
        session({ id: 'a', startedAt: new Date(2026, 6, 27, 19, 5).toISOString() }),
        session({ id: 'b', startedAt: new Date(2026, 6, 27, 18, 20).toISOString() }),
      ],
      NOW,
      false
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Hôm nay · 27/07');
    expect(groups[0].totalMinutes).toBe(50);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('mở nhóm mới khi sang ngày khác, giữ nguyên thứ tự server đã sắp', () => {
    const groups = groupFocusSessionsByDay(
      [
        session({ id: 'a', startedAt: new Date(2026, 6, 27, 19, 5).toISOString() }),
        session({ id: 'b', startedAt: new Date(2026, 6, 26, 20, 50).toISOString() }),
        session({ id: 'c', startedAt: new Date(2026, 6, 24, 19, 5).toISOString() }),
      ],
      NOW,
      false
    );

    expect(groups.map((g) => g.label)).toEqual(['Hôm nay · 27/07', '26/07', '24/07']);
    expect(groups.map((g) => g.totalMinutes)).toEqual([25, 25, 25]);
  });

  it('ĐỐI CHỨNG DƯƠNG: ngày toàn phiên hoàn thành vẫn cộng đúng', () => {
    // Không có ca này thì test dưới không phân biệt được "đã loại phiên hủy đúng cách" với
    // "hàm cộng sai và luôn trả 0".
    const groups = groupFocusSessionsByDay(
      [
        session({ id: 'a', durationMinutes: 25 }),
        session({ id: 'b', durationMinutes: 7, startedAt: session().startedAt }),
      ],
      NOW,
      false
    );
    expect(groups[0].totalMinutes).toBe(32);
  });

  it('ngày lẫn phiên hủy: hàng vẫn hiện, nhưng KHÔNG vào tổng ngày', () => {
    // Chính là ca 24/07 của mockup: mockup ghi tổng 32 = 25 + 7. Theo hợp đồng thì phải là 25.
    const groups = groupFocusSessionsByDay(
      [
        session({ id: 'a', startedAt: new Date(2026, 6, 24, 19, 5).toISOString() }),
        session({
          id: 'b',
          status: 'cancelled',
          durationMinutes: 0,
          focusedSeconds: 7 * 60,
          startedAt: new Date(2026, 6, 24, 17, 40).toISOString(),
        }),
      ],
      NOW,
      false
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[0].totalMinutes).toBe(25);
  });

  it('danh sách rỗng trả mảng rỗng, không ném', () => {
    expect(groupFocusSessionsByDay([], NOW, false)).toEqual([]);
  });

  it('hàng có ngày hỏng không làm sập nhóm còn lại', () => {
    const groups = groupFocusSessionsByDay(
      [session({ id: 'a' }), session({ id: 'x', startedAt: 'rác' })],
      NOW,
      false
    );

    expect(groups.map((g) => g.label)).toEqual(['Hôm nay · 27/07', 'Không rõ thời gian']);
  });

  /**
   * Lỗi đo được ở review PR #441: một ngày vắt qua ranh giới 20 hàng thì nhóm cuối chỉ cộng phần
   * ĐÃ TẢI, mà vẫn in ra như tổng của cả ngày (`08/08 — 0 phút` → `30 phút` sau "Xem thêm").
   * Chỉ nhóm cuối bị — server sắp giảm dần nên mọi nhóm trên đã gặp một ngày cũ hơn, tức đã đóng.
   */
  it('còn trang chưa tải: CHỈ nhóm cuối bị đánh dấu tổng một-phần', () => {
    const groups = groupFocusSessionsByDay(
      [
        session({ id: 'a', startedAt: new Date(2026, 6, 27, 19, 5).toISOString() }),
        session({ id: 'b', startedAt: new Date(2026, 6, 26, 20, 50).toISOString() }),
      ],
      NOW,
      true
    );

    expect(groups.map((g) => g.totalIsPartial)).toEqual([false, true]);
    // Con số vẫn được cộng như cũ — cờ chỉ nói nó đáng tin tới đâu, không đổi phép cộng.
    expect(groups.map((g) => g.totalMinutes)).toEqual([25, 25]);
  });

  it('ĐỐI CHỨNG ÂM: hết hàng thì không nhóm nào bị đánh dấu', () => {
    const groups = groupFocusSessionsByDay(
      [
        session({ id: 'a', startedAt: new Date(2026, 6, 27, 19, 5).toISOString() }),
        session({ id: 'b', startedAt: new Date(2026, 6, 26, 20, 50).toISOString() }),
      ],
      NOW,
      false
    );

    expect(groups.map((g) => g.totalIsPartial)).toEqual([false, false]);
  });

  it('danh sách rỗng + còn trang: không ném, vẫn là mảng rỗng', () => {
    expect(groupFocusSessionsByDay([], NOW, true)).toEqual([]);
  });
});

describe('formatDuration', () => {
  it('dưới một giờ in theo phút', () => {
    expect(formatDuration(50)).toBe('50 phút');
    expect(formatDuration(0)).toBe('0 phút');
  });

  it('tròn giờ không in phần phút thừa', () => {
    expect(formatDuration(120)).toBe('2 giờ');
  });

  it('lẻ giờ in cả hai phần', () => {
    expect(formatDuration(80)).toBe('1 giờ 20 phút');
  });
});
