import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/utils/test-utils';
import PlansPage from './PlansPage';
import { planApi } from '@/features/study-planner/api/plan.api';
import { scheduleApi } from '@/features/schedule/api/schedule.api';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import type { ScheduleResponse } from '@/features/schedule/types/schedule.types';

vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { listPlans: vi.fn() },
}));

vi.mock('@/features/schedule/api/schedule.api', () => ({
  scheduleApi: { getSchedule: vi.fn() },
}));

const TODAY = '2026-08-29';

function makePlan(overrides: Partial<PlanSummary> = {}): PlanSummary {
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

const EMPTY_SCHEDULE: ScheduleResponse = { todayDateKey: TODAY, items: [] };

beforeEach(() => {
  // Đếm số lời gọi là một assertion của bộ test này, nên số đếm phải bắt đầu từ 0 ở MỖI test —
  // repo không bật `clearMocks` trong vite config, và cộng dồn ở đây đọc y hệt một lần refetch thừa.
  vi.clearAllMocks();
  vi.mocked(planApi.listPlans).mockResolvedValue([makePlan()]);
  vi.mocked(scheduleApi.getSchedule).mockResolvedValue(EMPTY_SCHEDULE);
});

/** Chờ lần tải đầu xong — trước đó cả trang chỉ là một spinner. */
async function renderPage() {
  const view = render(<PlansPage />);
  await screen.findByRole('tab', { name: 'Lịch' });
  return view;
}

describe('PlansPage — bộ chuyển view', () => {
  it('opens on the plan list while the calendar default is deferred', async () => {
    await renderPage();
    expect(screen.getByRole('tab', { name: 'Kế hoạch' })).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * `<Tabs>` là controlled (`value` + `onValueChange`) để #405 chuyển được view bằng code từ
   * banner. Ca hỏng kinh điển của việc chuyển sang controlled là quên `onValueChange`: tab đứng
   * yên hoàn toàn, không lỗi, không cảnh báo. Test này là lưới cho đúng ca đó.
   */
  it('still switches view when clicked — controlled, not frozen', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('tab', { name: 'Lịch' }));

    expect(screen.getByRole('tab', { name: 'Lịch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Kế hoạch' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('PlansPage — tab Lịch giữ mount', () => {
  /**
   * Đo LIVE ở PR #412: Radix unmount con không-active, nên MỖI lần bấm sang Lịch là một
   * `GET /review-queue/schedule` mới (đếm 1 → 2 → 3 qua ba vòng đổi view). `forceMount` +
   * `data-[state=inactive]:hidden` là bản vá.
   */
  it('fetches the schedule exactly once, however often the view changes', async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(scheduleApi.getSchedule).toHaveBeenCalledTimes(1));

    for (let round = 0; round < 3; round += 1) {
      await user.click(screen.getByRole('tab', { name: 'Lịch' }));
      await user.click(screen.getByRole('tab', { name: 'Kế hoạch' }));
    }

    expect(scheduleApi.getSchedule).toHaveBeenCalledTimes(1);
  });

  /**
   * `forceMount` một mình là **nửa bản vá, và là nửa nguy hiểm hơn**: giữ mount mà quên ẩn thì
   * tấm lịch nằm ngay dưới danh sách kế hoạch ở mọi lúc. Đo được: bỏ riêng class này mà giữ
   * `forceMount` thì cả bộ test vẫn 4/4 xanh — nên lưới cho nó phải viết riêng.
   *
   * Đây là assertion theo TÊN CLASS, và đó là cái lưới duy nhất có ở tầng này: jsdom không nạp
   * stylesheet nào, `toBeVisible()` chỉ đọc style inline và thuộc tính `hidden` — mà `forceMount`
   * làm Radix đặt `hidden={false}`. Phép kiểm thật là lượt đo trên browser.
   */
  it('hides the mounted calendar while the plan list is the active view', async () => {
    const user = userEvent.setup();
    await renderPage();

    const panel = document.querySelector('[data-slot="tabs-content"][data-state="inactive"]');
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain('data-[state=inactive]:hidden');

    // Đối chứng dương: chính panel đó khi được chọn thì KHÔNG còn `inactive` để class kia bám vào.
    await user.click(screen.getByRole('tab', { name: 'Lịch' }));
    expect(document.getElementById(panel!.id)).toHaveAttribute('data-state', 'active');
  });

  /**
   * Nửa còn lại của cùng một bản vá, và là nửa dễ tưởng đã xong: hết refetch **chưa** đủ, state
   * của lịch cũng phải sống qua lần đổi view. Không có nó thì `monthCursor`, ngày đang chọn và
   * panel đang mở reset mỗi lần người dùng liếc sang danh sách kế hoạch rồi quay lại.
   */
  it('keeps the month the user paged to across a round trip through the plan list', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('tab', { name: 'Lịch' }));
    await user.click(await screen.findByRole('button', { name: 'Tháng sau' }));
    expect(screen.getByText('Tháng 9 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Kế hoạch' }));
    await user.click(screen.getByRole('tab', { name: 'Lịch' }));

    expect(screen.getByText('Tháng 9 2026')).toBeInTheDocument();
  });
});
