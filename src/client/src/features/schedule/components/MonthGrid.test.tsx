import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/utils/test-utils';
import { MonthGrid, type MonthGridProps } from './MonthGrid';
import type { PlanSummary } from '@/features/study-planner/types/concept';
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
    deadlines: new Map(),
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

describe('MonthGrid — bề ngang hẹp (<680px)', () => {
  /**
   * Nhánh hẹp được khoá làm HAI TẦNG, vì một tầng không đủ.
   *
   * jsdom không nạp stylesheet nào và `matchMedia` trả `matches: false`, nên **không assertion nào
   * ở tầng này phân biệt được một utility SỐNG với một utility CHẾT**. Đo được: render bản có lỗi
   * ghép class động (`${NARROW}hidden`) và bản đã vá cho ra `outerHTML` **trùng nhau từng byte**
   * (1642/1642), trong khi một đột biến đổi nội dung thì lệch ngay — tức phép so có khả năng thấy
   * khác biệt, và nó không thấy.
   *
   * ⇒ Tầng 1 (dưới đây): **hành vi render** — số chấm, màu chấm, có hay không có hàng chấm. Đây là
   *   logic thuần, assert được đầy đủ.
   * ⇒ Tầng 2: các mốc `max-[680px]:` chỉ khoá được bằng **assertion soi gương tên class**, cùng
   *   loại với khối tint `/7` ở trên. Nó khoá CHUỖI, không khoá hiệu lực CSS — phép kiểm thật của
   *   chúng là lượt đo browser ở 320px, và bản vá này ra đời từ đúng lượt đo đó.
   */
  const dotsIn = (name: RegExp | string) => [
    ...cell(name).querySelectorAll('span[aria-hidden="true"] i'),
  ];

  // ⚠️ Ca này từng ghim "4 chấm + đuôi". Đổi ở #439: khi CÓ đuôi thì số chấm hạ xuống 2 để đuôi có
  // chỗ thật — xem `MAX_DOTS` trong `MonthGrid.tsx`. Tổng vẫn nói đủ 6 (2 chấm + "+4").
  it('shows dots plus a "+n" tail, and the two together still account for every item', () => {
    renderGrid({
      days: [
        day(
          '2026-08-20',
          ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => item(n))
        ),
      ],
    });
    expect(dotsIn(/T5, 20\/08/)).toHaveLength(2);
    expect(within(cell(/T5, 20\/08/)).getByText('+4')).toBeInTheDocument();
  });

  it('does not add a tail at exactly four items', () => {
    renderGrid({
      days: [
        day(
          '2026-08-20',
          ['A', 'B', 'C', 'D'].map((n) => item(n))
        ),
      ],
    });
    const dotRow = cell(/T5, 20\/08/).querySelector('span[aria-hidden="true"]');
    expect(dotRow?.querySelectorAll('i')).toHaveLength(4);
    // Hỏi ĐÚNG hàng chấm, không hỏi cả ô: ở 4 mục thì hàng chip bên trên đang có "+1 mục nữa",
    // nên một phép tìm ở cấp ô sẽ bắt nhầm nó và test đỏ vì lý do không liên quan (đã đo).
    expect(dotRow?.querySelector('b')).toBeNull();
  });

  it('renders no dot row at all for a day with nothing on it', () => {
    renderGrid({ days: [] });
    expect(dotsIn(/T5, 20\/08/)).toHaveLength(0);
  });

  it('colours each dot by the same rule as its chip — truy ngược vẫn thắng quá hạn', () => {
    renderGrid({
      days: [
        day('2026-08-20', [item('Truy ngược', { reason: 'traceback' }), item('Thường')]),
        day('2026-09-02', [item('Tương lai')]),
      ],
    });
    expect(dotsIn(/T5, 20\/08/).map((d) => d.className)).toEqual([
      expect.stringContaining('bg-remediate'),
      expect.stringContaining('bg-mastery-weak'),
    ]);
    expect(dotsIn(/T4, 02\/09/)[0].className).toContain('bg-mastery-untested');
  });

  it('carries every 680px breakpoint the narrow layout depends on', () => {
    // Soi gương có chủ đích (xem ghi chú đầu describe). Bốn chuỗi này là toàn bộ khác biệt giữa
    // "ô đọc được nội dung" và "ô chỉ đọc được mật độ"; mất một chuỗi là mất một nửa bố cục, và
    // không có gì khác trong repo bắt được.
    renderGrid({ days: [day('2026-08-20', [item('A')])] });
    const target = cell(/T5, 20\/08/);
    expect(target.className).toContain('max-[680px]:min-h-[58px]');
    expect(within(target).getByText('A').className).toContain('max-[680px]:hidden');
    expect(within(target).getByText('≈9ʹ').className).toContain('max-[680px]:hidden');
    expect(target.querySelector('span[aria-hidden="true"]')?.className).toContain(
      'max-[680px]:flex'
    );
  });
});

describe('MonthGrid — mốc hạn chót (#439)', () => {
  /** Kế hoạch tối thiểu — chỉ `id`/`name` được đọc ở tầng này, phần còn lại là khung bắt buộc. */
  const somePlan = (name: string): PlanSummary => ({
    id: `plan-${name}`,
    name,
    deadline: '2026-09-02T23:59:59.999Z',
    status: 'active',
    conceptCount: 1,
    masteryDistribution: { strong: 0, learning: 0, weak: 0, untested: 1 },
    analysisStatus: 'done',
    analysisStartedAt: null,
    analysisErrorMessage: null,
    document: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    reviewQueueConceptCount: 0,
  });
  const marks = (entries: [string, { planCount: number; isPast: boolean }][]) =>
    new Map(
      entries.map(([dateKey, { planCount, isPast }]) => [
        dateKey,
        {
          plans: Array.from({ length: planCount }, (_, i) => somePlan(`KH ${i + 1}`)),
          isPast,
        },
      ])
    );
  const wedgeIn = (name: RegExp | string) => cell(name).querySelector('[data-deadline]');

  it('marks a day that is the deadline of at least one plan', () => {
    renderGrid({ deadlines: marks([['2026-09-02', { planCount: 1, isPast: false }]]) });
    expect(wedgeIn(/T4, 02\/09/)).toHaveAttribute('data-deadline', 'upcoming');
  });

  it('tells a passed deadline apart from an upcoming one', () => {
    renderGrid({
      deadlines: marks([
        ['2026-08-20', { planCount: 1, isPast: true }],
        ['2026-09-02', { planCount: 1, isPast: false }],
      ]),
    });
    expect(wedgeIn(/T5, 20\/08/)).toHaveAttribute('data-deadline', 'past');
    expect(wedgeIn(/T4, 02\/09/)).toHaveAttribute('data-deadline', 'upcoming');
  });

  /**
   * Ca "kế hoạch không có deadline" là chuyện THƯỜNG, không phải ca biên — nên phải hỏi riêng rằng
   * dấu **không** có mặt. `getByRole`/`getByText` chỉ hỏi thứ chúng đi tìm; một phần tử THỪA không
   * làm assertion nào đỏ. (Đột biến sống sót duy nhất của #437 đúng là loại này.)
   */
  it('puts no mark on a day that is nobody deadline', () => {
    renderGrid({ deadlines: marks([['2026-09-02', { planCount: 1, isPast: false }]]) });
    expect(wedgeIn(/T5, 20\/08/)).toBeNull();
    expect(cell(/T7, 29\/08/).querySelector('[data-deadline]')).toBeNull();
  });

  it('renders no mark at all when no plan has a deadline', () => {
    renderGrid({ deadlines: new Map() });
    expect(document.querySelectorAll('[data-deadline]')).toHaveLength(0);
  });

  /**
   * Ô rỗng là ca PHỔ BIẾN NHẤT của hạn chót — hạn hiếm khi trùng đúng ngày engine xếp buổi ôn.
   * Bản `cellLabel` cũ return sớm ở `itemCount === 0`, nên ô này sẽ đọc thành "không có gì được
   * xếp" trong khi thật ra có hạn chót: nói dối, không phải nói thiếu. Và ở ≤679px nhãn này là
   * thứ DUY NHẤT trình đọc màn hình còn đọc được.
   */
  it('still names the deadline on a day with nothing scheduled', () => {
    renderGrid({ deadlines: marks([['2026-08-26', { planCount: 2, isPast: false }]]) });
    // KHÔNG có "không có gì được xếp" ở đây: ghép nó trước một hạn chót cho ra câu tự cãi, và ở
    // ≤679px nhãn này được đọc thành lời. Mệnh đề rỗng chỉ là FALLBACK khi ô thật sự trống.
    expect(
      screen.getByRole('button', { name: 'T4, 26/08 — hạn chót của 2 kế hoạch' })
    ).toBeInTheDocument();
  });

  it('keeps the empty phrase for a day that really has nothing', () => {
    renderGrid({ deadlines: marks([['2026-08-26', { planCount: 1, isPast: false }]]) });
    expect(
      screen.getByRole('button', { name: 'T5, 27/08 — không có gì được xếp' })
    ).toBeInTheDocument();
  });

  it('keeps "quá hạn" for review items and separate wording for the deadline', () => {
    renderGrid({
      days: [day('2026-08-20', [item('A')])],
      deadlines: marks([['2026-08-20', { planCount: 1, isPast: true }]]),
    });
    // KHÔNG được đọc ra "…, quá hạn, quá hạn của 1 kế hoạch" — hai chủ ngữ khác nhau.
    expect(
      screen.getByRole('button', {
        name: 'T5, 20/08 — 1 khái niệm, quá hạn, hạn chót đã qua của 1 kế hoạch',
      })
    ).toBeInTheDocument();
  });

  /**
   * Vạt là con TUYỆT ĐỐI của `<button>`, không nằm trong `<span>` số ngày ⇒ nó **không tự thừa
   * hưởng** `opacity-30` của ô tràn tháng. Thiếu mệnh đề riêng thì ô mờ lại mang dấu chói nhất
   * lưới, ở đúng ô bấm không được.
   */
  it('dims the mark on an overflow cell, like the today disc already does', () => {
    renderGrid({ deadlines: marks([['2026-09-02', { planCount: 1, isPast: false }]]) });
    expect(wedgeIn(/T4, 02\/09/)?.className).toContain('opacity-30');
  });

  it('does not dim the mark on a day inside the month', () => {
    renderGrid({ deadlines: marks([['2026-08-20', { planCount: 1, isPast: false }]]) });
    expect(wedgeIn(/T5, 20\/08/)?.className).not.toContain('opacity-30');
  });

  /**
   * `data-deadline` ghim TRẠNG THÁI nào, không ghim VẼ RA SAO. Đảo hai nhánh mực thì thuộc tính
   * vẫn đúng và cả bộ test vẫn xanh, còn màn hình nói ngược: hạn đã qua thành mực đặc, hạn sắp
   * tới thành nét rỗng. Hai assert dưới ghim **ánh xạ** giữa trạng thái và hình — không phải soi
   * gương một chuỗi, vì thứ chúng khoá là quan hệ chứ không phải tên class.
   */
  it('draws an upcoming deadline solid and a passed one as an outline', () => {
    renderGrid({
      deadlines: marks([
        ['2026-08-20', { planCount: 1, isPast: true }],
        ['2026-09-02', { planCount: 1, isPast: false }],
      ]),
    });
    expect(wedgeIn(/T4, 02\/09/)?.className).toContain('bg-foreground');
    expect(wedgeIn(/T5, 20\/08/)?.className).toContain('border-foreground');
    // Và không lẫn sang nhau.
    expect(wedgeIn(/T4, 02\/09/)?.className).not.toContain('border-foreground');
    expect(wedgeIn(/T5, 20\/08/)?.className).not.toContain('bg-foreground');
  });
});

describe('MonthGrid — chấm mật độ nhường chỗ cho đuôi (hồi quy #404)', () => {
  const dotsIn2 = (name: RegExp | string) => [
    ...cell(name).querySelectorAll('span[aria-hidden="true"] i'),
  ];

  /**
   * Đo được ở 320px: `<i>` là flex item nên khi hàng chật Chrome bóp CHÍNH CÁC CHẤM — 5 mục ⇒
   * 1,44px, 14 mục ⇒ 0px, biến mất hẳn. Hàng không bao giờ tràn nên không phép đo tràn nào bắt
   * được. Bản vá là `shrink-0` **cộng** cắt bớt số chấm; `shrink-0` một mình chỉ dời chỗ hỏng ra
   * ngoài ô (đo: tràn 4–20px).
   */
  it('drops to two dots once there is a tail, so the tail has real room', () => {
    renderGrid({
      days: [
        day(
          '2026-08-20',
          ['A', 'B', 'C', 'D', 'E'].map((n) => item(n))
        ),
      ],
    });
    expect(dotsIn2(/T5, 20\/08/)).toHaveLength(2);
    expect(within(cell(/T5, 20\/08/)).getByText('+3')).toBeInTheDocument();
  });

  it('still shows four dots when they fit without a tail', () => {
    renderGrid({
      days: [
        day(
          '2026-08-20',
          ['A', 'B', 'C', 'D'].map((n) => item(n))
        ),
      ],
    });
    expect(dotsIn2(/T5, 20\/08/)).toHaveLength(4);
    expect(cell(/T5, 20\/08/).querySelector('span[aria-hidden="true"] b')).toBeNull();
  });

  it('never lets a dot be squeezed into a sliver', () => {
    renderGrid({
      days: [
        day(
          '2026-08-20',
          ['A', 'B', 'C', 'D', 'E'].map((n) => item(n))
        ),
      ],
    });
    for (const dot of dotsIn2(/T5, 20\/08/)) expect(dot.className).toContain('shrink-0');
  });
});
