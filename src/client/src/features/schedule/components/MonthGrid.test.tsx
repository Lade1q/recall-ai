import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/utils/test-utils';
import { MonthGrid, type MonthGridProps } from './MonthGrid';
import type { ScheduleDay, ScheduleItem } from '../types/schedule.types';

const TODAY = '2026-08-29';

function item(
  name: string,
  overrides: Partial<Pick<ScheduleItem, 'reason' | 'estimatedMinutes'>> = {}
): ScheduleItem {
  return {
    id: `id-${name}`,
    conceptId: `concept-${name}`,
    name,
    planId: 'plan-1',
    planName: 'Kế hoạch',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: '',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.5,
    status: 'pending',
    estimatedMinutes: 9,
    sourceSessionEndedAt: null,
    scheduledFor: '2026-08-20T03:00:00.000Z',
    dateKey: '2026-08-20',
    ...overrides,
  };
}

function day(dateKey: string, items: ScheduleItem[]): ScheduleDay {
  return {
    dateKey,
    items,
    totalMinutes: items.reduce((sum, entry) => sum + entry.estimatedMinutes, 0),
    isOverdue: dateKey < TODAY,
  };
}

function renderGrid(overrides: Partial<MonthGridProps> = {}) {
  const props: MonthGridProps = {
    monthCursor: { year: 2026, month: 8 },
    todayDateKey: TODAY,
    selectedDateKey: null,
    days: [],
    onSelectDay: vi.fn(),
    onShiftMonth: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MonthGrid {...props} />) };
}

/** Ô ngày được tìm bằng nhãn trợ năng — chính thứ duy nhất còn đọc được ở bề ngang hẹp. */
const cell = (name: RegExp | string) => screen.getByRole('button', { name });

describe('MonthGrid — khung tháng', () => {
  it('draws 6×7 day cells plus the three toolbar buttons', () => {
    renderGrid();
    // 42 ô + Hôm nay + ‹ + ›
    expect(screen.getAllByRole('button')).toHaveLength(45);
  });

  it('names the month with its year', () => {
    renderGrid();
    expect(screen.getByText('Tháng 8 2026')).toBeInTheDocument();
  });

  it('does not let an overflow cell be clicked', () => {
    renderGrid();
    // 31/07/2026 là ô dẫn của tháng 8.
    expect(cell(/T6, 31\/07/)).toBeDisabled();
    expect(cell(/T7, 29\/08/)).toBeEnabled();
  });
});

describe('MonthGrid — điều hướng tháng', () => {
  it('steps one month back and forward', async () => {
    const user = userEvent.setup();
    const { props } = renderGrid();

    await user.click(screen.getByRole('button', { name: 'Tháng trước' }));
    await user.click(screen.getByRole('button', { name: 'Tháng sau' }));

    expect(props.onShiftMonth).toHaveBeenNthCalledWith(1, -1);
    expect(props.onShiftMonth).toHaveBeenNthCalledWith(2, 1);
  });

  it('jumps back to the month of today, across a year boundary', async () => {
    const user = userEvent.setup();
    // Đang xem tháng 3/2027, hôm nay là 29/08/2026 ⇒ phải lùi 7 tháng. Ghim ca VẮT QUA NĂM để một
    // phép trừ tháng ngây thơ (`month - month`) không sống sót: nó sẽ ra −5.
    const { props } = renderGrid({ monthCursor: { year: 2027, month: 3 } });

    await user.click(screen.getByRole('button', { name: 'Hôm nay' }));

    expect(props.onShiftMonth).toHaveBeenCalledWith(-7);
  });

  it('disables "Hôm nay" while already on this month', () => {
    renderGrid({ monthCursor: { year: 2026, month: 8 } });
    expect(screen.getByRole('button', { name: 'Hôm nay' })).toBeDisabled();
  });
});

describe('MonthGrid — nội dung ô ngày', () => {
  it('shows up to three concept chips and folds the rest', async () => {
    // Ca ">3 mục trong một ô" KHÔNG dựng được từ dữ liệu thật (DB dev tối đa 2 mục/ô, fixture 10
    // mục cũng vậy) — và không cần: `MonthGrid` nhận `days` thuần prop, nên ca tràn tới được ở
    // đây mà không phải INSERT một hàng Postgres nào.
    const items = ['A', 'B', 'C', 'D', 'E'].map((name) => item(name));
    renderGrid({ days: [day('2026-08-20', items)] });

    const target = cell(/T5, 20\/08/);
    expect(within(target).getByText('A')).toBeInTheDocument();
    expect(within(target).getByText('C')).toBeInTheDocument();
    expect(within(target).queryByText('D')).not.toBeInTheDocument();
    expect(within(target).getByText('+2 mục nữa')).toBeInTheDocument();
  });

  it('does not fold anything at exactly three items', () => {
    renderGrid({
      days: [
        day(
          '2026-08-20',
          ['A', 'B', 'C'].map((name) => item(name))
        ),
      ],
    });
    expect(within(cell(/T5, 20\/08/)).queryByText(/mục nữa/)).not.toBeInTheDocument();
  });

  it('totals the minutes of the day', () => {
    renderGrid({
      days: [
        day('2026-08-20', [
          item('A', { estimatedMinutes: 14 }),
          item('B', { estimatedMinutes: 9 }),
        ]),
      ],
    });
    expect(within(cell(/T5, 20\/08/)).getByText('≈23ʹ')).toBeInTheDocument();
  });

  it('marks today and the selected day', () => {
    renderGrid({ selectedDateKey: '2026-08-20' });
    expect(cell(/T7, 29\/08/)).toHaveAttribute('aria-current', 'date');
    expect(cell(/T5, 20\/08/)).toHaveAttribute('aria-pressed', 'true');
    expect(cell(/T4, 19\/08/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the count and the overdue state in the cell label', () => {
    renderGrid({
      days: [day('2026-08-20', [item('A'), item('B')]), day('2026-09-02', [item('C')])],
    });
    expect(cell('T5, 20/08 — 2 khái niệm, quá hạn')).toBeInTheDocument();
    // 02/09 là ô tràn của tháng 8 — vẫn mang mục của mình, và không phải quá hạn.
    expect(cell('T4, 02/09 — 1 khái niệm')).toBeInTheDocument();
    expect(cell('T2, 24/08 — không có gì được xếp')).toBeInTheDocument();
  });

  it('hands the day back by dateKey when a cell is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderGrid();
    await user.click(cell(/T5, 20\/08/));
    expect(props.onSelectDay).toHaveBeenCalledWith('2026-08-20');
  });
});

describe('MonthGrid — màu của ô và chip', () => {
  /**
   * Assertion theo tên class là bản soi gương, và cố ý: mức tint `/7` là một quyết định ĐO ĐƯỢC,
   * không phải khẩu vị — chữ `--muted-foreground` 10–12px trên `/10` chỉ đạt 4,31 ở light mode,
   * dưới ngưỡng AA 4.5. Ai "dọn dẹp" nó thành `/10` hay `/14` sẽ phá lại đúng bản vá cũ của
   * `--muted-foreground`, và mắt thường gần như không thấy khác (độ nổi 1,08–1,37).
   */
  it('tints an overdue day at /7 and nothing stronger', () => {
    renderGrid({ days: [day('2026-08-20', [item('A')])] });
    const className = cell(/T5, 20\/08/).className;
    expect(className).toContain('bg-mastery-weak/7');
    expect(className).not.toMatch(/bg-mastery-weak\/(10|14)\b/);
  });

  it('leaves a day that is not overdue untinted', () => {
    renderGrid({ days: [day('2026-09-02', [item('A')])] });
    expect(cell(/T4, 02\/09/).className).not.toContain('bg-mastery-weak');
  });

  it('lets a traceback chip keep its own colour on an overdue day', () => {
    // Quá hạn đã được nói bằng NỀN của cả ô; "đây là nền tảng đang vỡ" thì không có chỗ nào khác
    // nói — nên truy ngược phải thắng quá hạn ở viền chip, không phải ngược lại.
    renderGrid({
      days: [day('2026-08-20', [item('Truy ngược', { reason: 'traceback' }), item('Thường')])],
    });
    const target = cell(/T5, 20\/08/);
    expect(within(target).getByText('Truy ngược').className).toContain('border-l-remediate');
    expect(within(target).getByText('Thường').className).toContain('border-l-mastery-weak');
  });
});

describe('MonthGrid — tháng chưa có buổi ôn nào', () => {
  it('explains an empty month instead of showing a mute grid', () => {
    renderGrid({ days: [] });
    expect(screen.getByText('Tháng 8 2026 chưa có buổi ôn nào')).toBeInTheDocument();
  });

  it('points at the overdue backlog when there is one', () => {
    // Tháng 10 rỗng, nhưng người dùng còn nợ 2 mục từ tháng 8 — câu trả lời cho "sao lịch trống"
    // nằm ở chỗ đó, không phải ở "hãy làm một phiên".
    renderGrid({
      monthCursor: { year: 2026, month: 10 },
      days: [day('2026-08-20', [item('A'), item('B')])],
    });
    expect(screen.getByText(/2 khái niệm quá hạn/)).toBeInTheDocument();
  });

  it('asks for a first session when there is no backlog either', () => {
    renderGrid({ monthCursor: { year: 2026, month: 10 }, days: [] });
    expect(screen.getByText(/Làm một phiên để có lịch/)).toBeInTheDocument();
  });

  it('stays away as soon as the month holds one session', () => {
    renderGrid({ days: [day('2026-08-20', [item('A')])] });
    expect(screen.queryByText(/chưa có buổi ôn nào/)).not.toBeInTheDocument();
  });

  it('does not count a neighbouring month that only shows through an overflow cell', () => {
    // 02/09 hiện ở hàng cuối của tháng 8, nhưng tháng 8 vẫn rỗng — thẻ phải ở lại. Đây là chỗ một
    // phép đếm "có mục nào trong 42 ô không" (bỏ quên `inMonth`) sẽ nói dối.
    renderGrid({ days: [day('2026-09-02', [item('A')])] });
    expect(screen.getByText('Tháng 8 2026 chưa có buổi ôn nào')).toBeInTheDocument();
  });
});
