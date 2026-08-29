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
  it('opens on the calendar — the epic default, unblocked once #405 shipped the draft banner', async () => {
    await renderPage();
    expect(screen.getByRole('tab', { name: 'Lịch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Kế hoạch' })).toHaveAttribute('aria-selected', 'false');
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

    // Lịch nay là view mặc định, nên phải RỜI khỏi nó mới có ca "đã mount mà không được chọn" —
    // đúng ca mà `forceMount` tạo ra và class kia phải dọn.
    const calendarPanelId = screen.getByRole('tabpanel').id;
    await user.click(screen.getByRole('tab', { name: 'Kế hoạch' }));

    const panel = document.getElementById(calendarPanelId);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('data-state', 'inactive');
    expect(panel?.className).toContain('data-[state=inactive]:hidden');

    // Đối chứng dương: chính panel đó khi được chọn thì KHÔNG còn `inactive` để class kia bám vào.
    await user.click(screen.getByRole('tab', { name: 'Lịch' }));
    expect(document.getElementById(calendarPanelId)).toHaveAttribute('data-state', 'active');
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

/**
 * Ca đã đẻ ra hồi quy PR #409, và là điều kiện DUY NHẤT còn lại chặn `DEFAULT_VIEW = 'schedule'`.
 *
 * Tài khoản chỉ có kế hoạch `draft`: `hasNoPlansAtAll` là `false` nên `<Tabs>` render, nhưng
 * `/review-queue/schedule` lọc `plan.status === 'active'` ⇒ lịch rỗng **theo định nghĩa**. Trước
 * #405, mở thẳng vào Lịch là người dùng mất bằng chứng duy nhất trên màn rằng họ CÓ kế hoạch —
 * badge `Chưa xác nhận 1` nằm trong panel kia.
 *
 * Bài test này ghim đúng thứ chữa nó: banner phải **có mặt** và phải **đi tiếp được**. Nếu ai gỡ
 * banner mà quên trả `DEFAULT_VIEW` về `'plans'`, đây là chỗ đỏ.
 */
describe('PlansPage — tài khoản chỉ có kế hoạch draft', () => {
  beforeEach(() => {
    vi.mocked(planApi.listPlans).mockResolvedValue([
      makePlan({ id: 'plan-draft', name: '[CNPM] chap1', status: 'draft' }),
    ]);
  });

  it('mở vào Lịch rỗng nhưng vẫn nói ra là có kế hoạch chưa xác nhận', async () => {
    await renderPage();

    expect(screen.getByRole('tab', { name: 'Lịch' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/1 kế hoạch chưa xác nhận đồ thị/)).toBeInTheDocument();
  });

  it('banner đưa sang view Kế hoạch VÀ tab Chưa xác nhận, không chỉ một trong hai', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole('button', { name: /Xem & xác nhận/ }));

    expect(screen.getByRole('tab', { name: 'Kế hoạch' })).toHaveAttribute('aria-selected', 'true');
    // Dải tab trạng thái là `role="tab"` viết tay trong `PlansPage`, không phải Radix.
    expect(screen.getByRole('tab', { name: /Chưa xác nhận/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('[CNPM] chap1')).toBeInTheDocument();
  });
});
