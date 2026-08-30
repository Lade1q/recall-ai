import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/utils/test-utils';
import { ScheduleItemRow } from './ScheduleItemRow';
import type { ScheduleItem } from '../types/schedule.types';

function makeItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    name: 'Cây nhị phân',
    planId: 'plan-1',
    planName: 'Cấu trúc dữ liệu',
    scheduledFor: '2026-08-30T03:00:00.000Z',
    dateKey: '2026-08-30',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: 'Đã đến lịch ôn tập theo mức độ ghi nhớ',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.85,
    status: 'pending',
    estimatedMinutes: 9,
    sourceSessionEndedAt: null,
    ...overrides,
  };
}

const TRACEBACK = {
  reason: 'traceback' as const,
  depth: 1,
  masteryScore: 0,
  sourceConceptName: 'Đệ quy',
  reasonText: "Nền tảng của 'Đệ quy' mà bạn còn yếu",
};

function renderRow(item: ScheduleItem) {
  return render(
    <ul>
      <ScheduleItemRow
        item={item}
        todayDateKey="2026-08-29"
        isExpanded
        isPending={false}
        onToggle={vi.fn()}
        onReschedule={vi.fn()}
        onRemove={vi.fn()}
      />
    </ul>
  );
}

const rescheduleButton = () => screen.queryByRole('button', { name: /Dời .* sang ngày khác/ });

/**
 * Gạch đầu dòng 🔴 của DoD #405: **mục truy ngược không có nút "Dời sang…", kèm câu giải thích.**
 *
 * Đột biến cho mục truy ngược hiện nút vẫn sống sót qua toàn bộ suite trước bài này — tức hôm nay
 * không có gì ngăn nó hồi quy. Điều kiện ẩn nút phải khớp ĐÚNG vị từ của server
 * (`reason='traceback' && masteryScore < 0.6`), nên các ca dưới đây đi men theo chính biên đó.
 */
describe('ScheduleItemRow — nút "Dời sang ngày…"', () => {
  it('mục truy ngược yếu KHÔNG có nút', () => {
    renderRow(makeItem(TRACEBACK));
    expect(rescheduleButton()).toBeNull();
  });

  it('mục ôn theo lịch CÓ nút', () => {
    renderRow(makeItem());
    expect(rescheduleButton()).not.toBeNull();
  });

  it('truy ngược mà chưa kiểm tra (mastery null) vẫn bị khoá — server cũng khoá', () => {
    // Server dùng `masteryScore ?? 0`, tức "chưa kiểm tra" KHÔNG phải bằng chứng đã vững.
    renderRow(makeItem({ ...TRACEBACK, masteryScore: null }));
    expect(rescheduleButton()).toBeNull();
  });

  it('biên 0.6: truy ngược 0.59 khoá, 0.60 mở', () => {
    const { unmount } = renderRow(makeItem({ ...TRACEBACK, masteryScore: 0.59 }));
    expect(rescheduleButton()).toBeNull();
    unmount();

    renderRow(makeItem({ ...TRACEBACK, masteryScore: 0.6 }));
    expect(rescheduleButton()).not.toBeNull();
  });
});

describe('ScheduleItemRow — câu giải thích khi bị khoá', () => {
  it('mục truy ngược nói vì sao không dời được', () => {
    renderRow(makeItem(TRACEBACK));
    const lock = screen.getByText(/Không dời được lịch/);
    expect(lock).toBeInTheDocument();
    expect(lock.textContent).toContain('hệ thống sẽ xếp lại sau mỗi phiên');
  });

  it('⛔ câu đó KHÔNG chứa "vào hôm nay"', () => {
    // Nhầm lẫn này đã gây chuyện ba lần (#400, mục Microcopy): hệ thống xếp lại theo kết quả
    // phiên, nó KHÔNG kéo mục về hôm nay.
    renderRow(makeItem(TRACEBACK));
    expect(screen.getByText(/Không dời được lịch/).textContent).not.toContain('vào hôm nay');
  });

  it('mục không bị khoá thì không có câu giải thích thừa', () => {
    renderRow(makeItem());
    expect(screen.queryByText(/Không dời được lịch/)).toBeNull();
  });
});

describe('ScheduleItemRow — dòng "vì sao"', () => {
  it('render reasonText NGUYÊN VĂN và biến tên khái niệm nguồn thành link', () => {
    renderRow(makeItem(TRACEBACK));
    const link = screen.getByRole('link', { name: /Đệ quy/ });
    expect(link).toHaveAttribute('href', '/plan/plan-1');
    // Chuỗi giữ nguyên dấu nháy của server, không bị client viết lại.
    expect(link.textContent).toBe("'Đệ quy'");
  });
});
