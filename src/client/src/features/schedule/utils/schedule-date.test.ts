import { describe, expect, it } from 'vitest';
import { SCHEDULE_SAMPLE } from '../__fixtures__/schedule-sample';
import type { ScheduleItem } from '../types/schedule.types';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import {
  buildDeadlineMarks,
  buildMonthCells,
  formatDayLabel,
  formatMonthLabel,
  groupByDateKey,
  monthCursorFromDateKey,
  monthsBetween,
  shiftMonthCursor,
} from './schedule-date';

function item(dateKey: string, name: string, estimatedMinutes: number): ScheduleItem {
  return {
    id: `${dateKey}-${name}`,
    conceptId: name,
    name,
    planId: 'plan',
    planName: 'Kế hoạch',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: '',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.5,
    status: 'pending',
    estimatedMinutes,
    sourceSessionEndedAt: null,
    scheduledFor: `${dateKey}T03:00:00.000Z`,
    dateKey,
  };
}

describe('monthCursor', () => {
  it('reads year and 1-based month off a dateKey', () => {
    expect(monthCursorFromDateKey('2026-08-18')).toEqual({ year: 2026, month: 8 });
  });

  it('rolls the year forward past December', () => {
    expect(shiftMonthCursor({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('rolls the year backward past January', () => {
    expect(shiftMonthCursor({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  // Ghim `monthsBetween` là nghịch đảo của `shiftMonthCursor` — hai hàm này là lý do số học tháng
  // chỉ có một chỗ biết, nên chúng phải khớp nhau chứ không chỉ "mỗi hàm tự đúng".
  it('measures the delta that shiftMonthCursor would need, across a year boundary', () => {
    const from = { year: 2025, month: 11 };
    const to = { year: 2026, month: 3 };
    expect(monthsBetween(from, to)).toBe(4);
    expect(monthsBetween(to, from)).toBe(-4);
    expect(shiftMonthCursor(from, monthsBetween(from, to))).toEqual(to);
  });

  it('is zero for the same month', () => {
    expect(monthsBetween({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(0);
  });
});

describe('formatDayLabel', () => {
  it('names the weekday of the VN calendar day, not of a re-shifted instant', () => {
    // 18/08/2026 là thứ Ba.
    expect(formatDayLabel('2026-08-18')).toBe('T3, 18/08');
  });
});

describe('groupByDateKey', () => {
  const today = '2026-08-18';

  it('puts every item of a day in one bucket and sums its minutes', () => {
    const days = groupByDateKey(
      [item('2026-08-20', 'A', 14), item('2026-08-20', 'B', 9), item('2026-08-21', 'C', 3)],
      today
    );
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ dateKey: '2026-08-20', totalMinutes: 23 });
    expect(days[1]).toMatchObject({ dateKey: '2026-08-21', totalMinutes: 3 });
  });

  it('keeps the order the server sent inside a day — the two-tier sort is not redone here', () => {
    const days = groupByDateKey(
      [item('2026-08-20', 'first', 1), item('2026-08-20', 'second', 1)],
      today
    );
    expect(days[0].items.map((i) => i.name)).toEqual(['first', 'second']);
  });

  it('marks a day before today as overdue, and today itself as not', () => {
    const days = groupByDateKey([item('2026-08-17', 'A', 1), item(today, 'B', 1)], today);
    expect(days.map((d) => d.isOverdue)).toEqual([true, false]);
  });

  // Ghim HƯỚNG của phép so, không chỉ ghim "hôm nay thì không quá hạn": đổi `<` thành `!==` cũng
  // qua được ca trên. Hệ quả thật nếu để lọt — `resolvePanel` gom thanh "Còn nợ" bằng
  // `days.filter(d => d.isOverdue)`, nên một phép so sai hướng làm nó hốt cả lịch tương lai.
  it('does not call a future day overdue', () => {
    const days = groupByDateKey([item('2026-08-25', 'A', 1)], today);
    expect(days[0].isOverdue).toBe(false);
  });

  it('sorts days by dateKey even when the input arrives out of order', () => {
    const days = groupByDateKey(
      [item('2026-08-25', 'C', 1), item('2026-08-12', 'A', 1), item('2026-08-19', 'B', 1)],
      today
    );
    expect(days.map((d) => d.dateKey)).toEqual(['2026-08-12', '2026-08-19', '2026-08-25']);
  });

  it('groups the real payload into 3 quá hạn · 2 hôm nay · 5 sắp tới', () => {
    const days = groupByDateKey(SCHEDULE_SAMPLE.items, SCHEDULE_SAMPLE.todayDateKey);
    const count = (predicate: (dateKey: string) => boolean): number =>
      days.filter((d) => predicate(d.dateKey)).reduce((sum, d) => sum + d.items.length, 0);

    expect(count((k) => k < SCHEDULE_SAMPLE.todayDateKey)).toBe(3);
    expect(count((k) => k === SCHEDULE_SAMPLE.todayDateKey)).toBe(2);
    expect(count((k) => k > SCHEDULE_SAMPLE.todayDateKey)).toBe(5);
  });
});

describe('formatMonthLabel', () => {
  it('keeps the year — the grid can be paged past December', () => {
    expect(formatMonthLabel({ year: 2026, month: 8 })).toBe('Tháng 8 2026');
  });
});

describe('buildMonthCells', () => {
  /** `dateKey` → thứ trong tuần theo UTC (0 = Chủ nhật). Không đổi múi giờ, chỉ đọc lại chuỗi. */
  const weekday = (dateKey: string): number => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

  const dateKeys = (year: number, month: number): string[] =>
    buildMonthCells({ year, month }).map((cell) => cell.dateKey);

  const inMonthCount = (year: number, month: number): number =>
    buildMonthCells({ year, month }).filter((cell) => cell.inMonth).length;

  it('always returns 6×7 cells', () => {
    expect(buildMonthCells({ year: 2026, month: 8 })).toHaveLength(42);
  });

  it('always starts on a Monday', () => {
    // Bốn tháng có ngày-1 rơi vào bốn thứ khác nhau — một tháng không phân biệt được phép xoay
    // `(getUTCDay() + 6) % 7` với một hằng số may mắn.
    for (const [year, month] of [
      [2026, 8], // ngày 1 là thứ Bảy
      [2026, 11], // ngày 1 là Chủ nhật — ca lệch nhiều nhất, 6 ô đầu thuộc tháng trước
      [2027, 1], // ngày 1 là thứ Sáu
      [2028, 2], // ngày 1 là thứ Ba
    ] as const) {
      expect(weekday(dateKeys(year, month)[0])).toBe(1);
    }
  });

  it('walks one calendar day at a time, with no gap and no repeat', () => {
    // Ghim rằng 42 ô là một DẢI LIÊN TỤC. Một lỗi lệch múi giờ trong `Date.UTC` sẽ lộ ra ở đây
    // dưới dạng hai ô cùng ngày (hoặc nhảy cóc), chứ không lộ ở phép đếm 42.
    const keys = dateKeys(2026, 11);
    for (let index = 1; index < keys.length; index += 1) {
      const previous = new Date(`${keys[index - 1]}T00:00:00Z`).getTime();
      expect(new Date(`${keys[index]}T00:00:00Z`).getTime() - previous).toBe(86_400_000);
    }
  });

  it('agrees with its own dayOfMonth field on every cell', () => {
    for (const cell of buildMonthCells({ year: 2026, month: 8 })) {
      expect(cell.dayOfMonth).toBe(new Date(`${cell.dateKey}T00:00:00Z`).getUTCDate());
    }
  });

  it('marks exactly the days of the month, including a leap February', () => {
    expect(inMonthCount(2026, 8)).toBe(31);
    expect(inMonthCount(2026, 11)).toBe(30);
    expect(inMonthCount(2026, 2)).toBe(28);
    expect(inMonthCount(2028, 2)).toBe(29); // 2028 nhuận
  });

  it('starts a Saturday month with 5 leading cells from the previous month', () => {
    const cells = buildMonthCells({ year: 2026, month: 8 });
    expect(cells[0]).toEqual({ dateKey: '2026-07-27', dayOfMonth: 27, inMonth: false });
    expect(cells[5]).toEqual({ dateKey: '2026-08-01', dayOfMonth: 1, inMonth: true });
  });

  it('still fits a 30-day month that starts on Sunday — the worst case for 42 cells', () => {
    // 6 ô dẫn + 30 ngày = 36 ≤ 42. Ca này là lý do lưới có 6 hàng chứ không phải 5.
    const cells = buildMonthCells({ year: 2026, month: 11 });
    expect(cells[6]).toMatchObject({ dateKey: '2026-11-01', inMonth: true });
    expect(cells[35]).toMatchObject({ dateKey: '2026-11-30', inMonth: true });
    expect(cells[36]).toMatchObject({ dateKey: '2026-12-01', inMonth: false });
  });

  it('rolls the year in both directions on the overflow cells', () => {
    expect(dateKeys(2027, 1)[0]).toBe('2026-12-28');
    expect(dateKeys(2026, 12)[41]).toBe('2027-01-10');
  });

  /**
   * Bất biến mà docstring của hàm viện dẫn: ô tràn mang `dateKey` THẬT của tháng bên cạnh.
   *
   * Hệ quả nếu để lọt: lưới tra mục theo `dateKey`, nên một ô tràn mang chuỗi rỗng / `dateKey` của
   * tháng đang xem sẽ làm **mục ngày 01 tháng sau biến mất** ở hàng cuối — không có gì đỏ, chỉ là
   * một buổi ôn không ai nhìn thấy.
   */
  it('gives overflow cells the real neighbouring dateKey, not a blank', () => {
    const cells = buildMonthCells({ year: 2026, month: 8 });
    const trailing = cells.filter((cell) => !cell.inMonth && cell.dateKey > '2026-08-31');
    expect(trailing.map((cell) => cell.dateKey)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });
});

describe('buildDeadlineMarks', () => {
  const TODAY = '2026-08-30';

  function plan(overrides: Partial<PlanSummary> = {}): PlanSummary {
    return {
      id: 'plan-1',
      name: 'Kiến trúc phần mềm',
      deadline: null,
      status: 'active',
      conceptCount: 4,
      masteryDistribution: { strong: 1, learning: 1, weak: 1, untested: 1 },
      analysisStatus: 'done',
      analysisStartedAt: null,
      analysisErrorMessage: null,
      document: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      reviewQueueConceptCount: 0,
      ...overrides,
    };
  }
  const build = (plans: PlanSummary[], hidden: string[] = []) =>
    buildDeadlineMarks(plans, new Set(hidden), TODAY);

  /**
   * 🔴 Ca đắt nhất của cả hàm. API lưu deadline là `23:59:59.999Z` của đúng ngày người học chọn,
   * nên ngày-UTC của mốc CHÍNH LÀ ngày đã chọn. Cắt sang giờ VN — như lưới làm với `scheduledFor`
   * — đẩy nó sang hôm sau. Và nó chỉ lệch trên hình dạng MỚI: hàng cũ lưu `T00:00:00.000Z` vẫn
   * đúng ⇒ hỏng một nửa, loại khó chẩn đoán nhất.
   */
  it('keeps the day the student picked, for both shapes the DB holds', () => {
    const marks = build([
      plan({ id: 'mới', deadline: '2026-09-10T23:59:59.999Z' }),
      plan({ id: 'cũ', deadline: '2026-09-11T00:00:00.000Z' }),
    ]);
    expect([...marks.keys()].sort()).toEqual(['2026-09-10', '2026-09-11']);
    // Đối chứng: nếu ai đó đổi sang VN (UTC+7) thì hàng "mới" thành 11/09 và hai kế hoạch dồn
    // vào một ngày — phép đo này phân biệt được đúng chỗ đó.
    expect(marks.get('2026-09-10')?.planCount).toBe(1);
    expect(marks.get('2026-09-11')?.planCount).toBe(1);
  });

  it('counts every plan that shares a deadline day', () => {
    const marks = build([
      plan({ id: 'a', deadline: '2026-09-10T23:59:59.999Z' }),
      plan({ id: 'b', name: 'Cơ sở dữ liệu', deadline: '2026-09-10T23:59:59.999Z' }),
    ]);
    expect(marks.get('2026-09-10')).toEqual({ planCount: 2, isPast: false });
  });

  it('tells a passed deadline from an upcoming one, and today is not past', () => {
    const marks = build([
      plan({ id: 'a', deadline: '2026-08-29T23:59:59.999Z' }),
      plan({ id: 'b', deadline: `${TODAY}T23:59:59.999Z` }),
      plan({ id: 'c', deadline: '2026-08-31T23:59:59.999Z' }),
    ]);
    expect(marks.get('2026-08-29')?.isPast).toBe(true);
    expect(marks.get(TODAY)?.isPast).toBe(false);
    expect(marks.get('2026-08-31')?.isPast).toBe(false);
  });

  it('ignores plans the calendar does not draw — the grid must not outrun the filter', () => {
    const marks = build(
      [
        plan({ id: 'draft', status: 'draft', deadline: '2026-09-10T23:59:59.999Z' }),
        plan({ id: 'archived', status: 'archived', deadline: '2026-09-11T23:59:59.999Z' }),
        plan({ id: 'ẩn', deadline: '2026-09-12T23:59:59.999Z' }),
      ],
      ['ẩn']
    );
    expect(marks.size).toBe(0);
  });

  it('treats a plan without a deadline as ordinary, not as an edge case', () => {
    expect(build([plan({ deadline: null })]).size).toBe(0);
  });

  /**
   * Hàm không chạm `Date` một lần nào — thuần phép so chuỗi. Mạnh hơn một test ghim `TZ`: không có
   * đường nào cho múi giờ máy chạy vào kết quả, nên không cần chạy lại dưới hai zone.
   */
  it('reads the same under any machine timezone, because it never builds a Date', () => {
    const source = buildDeadlineMarks.toString();
    expect(source).not.toMatch(/new Date|Date\.|toISOString|getTimezoneOffset/);
  });
});
