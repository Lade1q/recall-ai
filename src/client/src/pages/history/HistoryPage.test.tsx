import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@/utils/test-utils';
import HistoryPage from './HistoryPage';
import { focusSessionApi } from '@/features/focus/api/focus.api';
import { historyApi } from '@/features/history/api/history.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { FocusSessionListItem } from '@/features/focus/types/focus.types';

// Cả ba nguồn của màn đều mock: `/interviews` (tab kia), `/plans` (tên kế hoạch + bộ lọc), và
// `/focus-sessions` (tab này). Không có backend trong jsdom.
vi.mock('@/features/focus/api/focus.api', () => ({
  focusSessionApi: { list: vi.fn() },
}));
vi.mock('@/features/history/api/history.api', () => ({
  historyApi: { listInterviews: vi.fn() },
  PAGE_SIZE: 20,
}));
vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { listPlans: vi.fn() },
}));

const listFocus = vi.mocked(focusSessionApi.list);
const listInterviews = vi.mocked(historyApi.listInterviews);
const listPlans = vi.mocked(planApi.listPlans);

function focusSession(over: Partial<FocusSessionListItem> = {}): FocusSessionListItem {
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
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ...over,
  };
}

/** Mở màn rồi chuyển sang tab "Phiên học" — mặc định của khung là tab Phiên kiểm tra. */
async function openFocusTab() {
  render(<HistoryPage />);
  await userEvent.click(screen.getByRole('tab', { name: 'Phiên học' }));
}

beforeEach(() => {
  listFocus.mockReset();
  listInterviews.mockReset().mockResolvedValue([]);
  listPlans.mockReset().mockResolvedValue([]);
});

describe('HistoryPage — tab Phiên học', () => {
  it('KHÔNG có phiên nào ⇒ hiện khung rỗng với CTA sang FS-01', async () => {
    // AC #247 kê ca này ("Trạng thái rỗng dùng lại khuôn DB-03, đổi CTA sang FS-01") nhưng chưa
    // test nào chạm: đột biến làm điều kiện rỗng không bao giờ đúng vẫn xanh 441/441.
    listFocus.mockResolvedValue([]);
    await openFocusTab();

    expect(await screen.findByText('Chưa có phiên học nào')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Bắt đầu phiên học đầu tiên' });
    expect(cta).toHaveAttribute('href', '/focus');
    // Khung rỗng thay CHO danh sách, không nằm cạnh nó.
    expect(screen.queryByRole('region', { name: 'Danh sách phiên học' })).not.toBeInTheDocument();
  });

  it('CÓ phiên ⇒ hiện danh sách, không hiện khung rỗng', async () => {
    // Đối chứng âm: không có ca này thì test trên không phân biệt được "điều kiện rỗng đúng"
    // với "khung rỗng luôn hiện".
    listFocus.mockResolvedValue([focusSession()]);
    await openFocusTab();

    expect(await screen.findByRole('region', { name: 'Danh sách phiên học' })).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên học nào')).not.toBeInTheDocument();
  });

  it('đang tải ⇒ skeleton, KHÔNG loé khung rỗng', async () => {
    // Cặp với ca trên: cả hai cùng trả lời một câu hỏi "rỗng hay đang tải". Promise treo hẳn để
    // đo đúng khoảnh khắc giữa chừng.
    listFocus.mockReturnValue(new Promise(() => {}));
    await openFocusTab();

    expect(await screen.findByLabelText('Đang tải lịch sử phiên học')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên học nào')).not.toBeInTheDocument();
  });

  it('tải hỏng ⇒ khối lỗi có nút "Thử lại", và bấm thì gọi lại API', async () => {
    listFocus.mockRejectedValueOnce(new Error('mạng hỏng'));
    await openFocusTab();

    expect(await screen.findByText('Không tải được lịch sử phiên học.')).toBeInTheDocument();
    // Ca hỏng KHÔNG được đọc thành ca rỗng — hai câu nói hai điều khác nhau.
    expect(screen.queryByText('Chưa có phiên học nào')).not.toBeInTheDocument();

    listFocus.mockResolvedValue([focusSession()]);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Danh sách phiên học' })).toBeInTheDocument()
    );
  });
});
