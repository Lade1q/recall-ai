import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/utils/test-utils';
import DashboardPage from './DashboardPage';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import { dashboardApi } from '@/features/dashboard/api/dashboard.api';
import type { ReviewQueueListResponse } from '@/features/review-queue/types/review-queue.types';
import type { PlanSummary } from '@/features/study-planner/types/concept';

/**
 * Ba nguồn dữ liệu độc lập của Dashboard đều bị mock: trang đọc `/review-queue/today`,
 * `/dashboard/stats` và `/plans` qua ba `useAsyncResource` riêng, không cái nào chạm backend
 * thật được trong jsdom. Mock cả ba mới dựng lại được đúng các tổ hợp trạng thái bên dưới.
 */
vi.mock('@/features/review-queue/api/review-queue.api', () => ({
  reviewQueueApi: { getToday: vi.fn() },
}));

// `getPlan` phục vụ mini Concept Graph — chỉ render khi có plan `active`, và nó tự bắt lỗi nên
// một promise bị từ chối đủ để khối đó về trạng thái lỗi của riêng nó, không ảnh hưởng phần đang
// kiểm. Thiếu hàm này thì effect ném ngay lúc gọi và làm hỏng cả lần render.
vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { listPlans: vi.fn(), getPlan: vi.fn(), getConceptDetail: vi.fn() },
}));

vi.mock('@/features/dashboard/api/dashboard.api', () => ({
  dashboardApi: { getStats: vi.fn() },
}));

/** Nguyên văn `NO_PLAN_MESSAGE` (`scheduling.service.ts:129`) — so chuỗi, không so ý. */
const NO_PLAN_MESSAGE = 'Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.';

function makeTodayResponse(overrides: Partial<ReviewQueueListResponse> = {}) {
  return {
    items: [],
    message: NO_PLAN_MESSAGE,
    totalEstimatedMinutes: 0,
    noScheduleNote: null,
    ...overrides,
  } satisfies ReviewQueueListResponse;
}

function makePlan(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: 'plan-1',
    name: 'Mạng máy tính',
    deadline: null,
    status: 'active',
    conceptCount: 4,
    masteryDistribution: { strong: 1, learning: 1, weak: 1, untested: 1 },
    analysisStatus: null,
    analysisStartedAt: null,
    analysisErrorMessage: null,
    document: null,
    createdAt: '2026-08-01T00:00:00Z',
    reviewQueueConceptCount: 0,
    ...overrides,
  };
}

const EMPTY_STATS = {
  studyStreakDays: 0,
  weeklyStudyMinutes: 0,
  conceptsMastered: 0,
  conceptsTotal: 0,
};

const LOGGED_IN = {
  authUser: { id: 'user-1', email: 'a@b.c', name: null, createdAt: '2026-01-01T00:00:00Z' },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardApi.getStats).mockResolvedValue(EMPTY_STATS);
  vi.mocked(planApi.getPlan).mockRejectedValue(new Error('mini graph ngoài phạm vi test này'));
});

describe('DashboardPage — ca A1 (tài khoản 0 kế hoạch)', () => {
  it('gộp thành đúng MỘT thẻ, thân bài là message server nguyên văn, CTA đi /plan/new', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(makeTodayResponse());

    render(<DashboardPage />, LOGGED_IN);

    const cta = await screen.findByRole('link', { name: 'Tạo kế hoạch đầu tiên' });
    expect(cta).toHaveAttribute('href', '/plan/new');

    // Thân bài phải là chuỗi của server, không phải copy client (#273/#278).
    expect(screen.getByText(NO_PLAN_MESSAGE)).toBeInTheDocument();

    // Và chỉ MỘT thẻ: khối "Gợi ý hôm nay" bị ẩn hẳn ở ca này (mockup A1).
    expect(screen.queryByRole('link', { name: 'Xem kế hoạch ôn tập' })).not.toBeInTheDocument();
  });

  /**
   * Hồi quy của PR #408, bắt được khi review đo LIVE: khối `BlockError` + "Thử lại" từng nằm
   * trọn trong `{!isBrandNewAccount && …}`, nên tài khoản 0 kế hoạch mà `/review-queue/today`
   * lỗi sẽ mất CẢ báo lỗi lẫn đường phục hồi, và thẻ onboarding thì rỗng ruột vì `message` là
   * `null`. Người dùng mới tinh — đúng đối tượng epic #383 — không còn cách nào ngoài F5.
   *
   * `todayFailed` là ngoại lệ mở lại khối đó, và nó phải là bản sao nguyên văn điều kiện của
   * nhánh `BlockError` — test khoá đúng cặp "có báo lỗi + có đường phục hồi".
   */
  it('🔴 today lỗi: vẫn báo lỗi + nút "Thử lại" bên cạnh thẻ onboarding', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getToday).mockRejectedValue(new Error('network down'));

    render(<DashboardPage />, LOGGED_IN);

    // Khối gợi ý giữ nguyên báo lỗi + đường phục hồi như trước #389.
    expect(await screen.findByText('Không tải được gợi ý hôm nay.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();

    // Thẻ onboarding vẫn ở đó — nhưng thân bài để TRỐNG, không bịa chữ client thay cho server.
    // Chuyện hỏng đã được `BlockError` nói đúng một lần ở trên; nói lần hai bằng giọng khác là
    // đúng cái bệnh #389 sinh ra để chữa.
    const cta = screen.getByRole('link', { name: 'Tạo kế hoạch đầu tiên' });
    const body = cta.closest('div')?.querySelector('p');
    expect(body?.textContent?.trim()).toBe('');
    expect(screen.queryByText(NO_PLAN_MESSAGE)).not.toBeInTheDocument();
  });

  /**
   * Chốt chặn cho cách sửa SAI đã bị loại: `isBrandNewAccount && today.data !== null`.
   * `useAsyncResource` khởi tạo `data: null`, nên điều kiện đó gộp cả ca đang tải vào ca lỗi —
   * skeleton gợi ý hiện lên rồi tan ở MỌI tài khoản trống, đúng thứ mockup A1 cấm.
   */
  it('today còn đang tải: KHÔNG nháy skeleton khối gợi ý ở tài khoản trống', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    // `/plans` về trước `/review-queue/today` là thứ tự đo được ổn định trên máy thật.
    vi.mocked(reviewQueueApi.getToday).mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />, LOGGED_IN);

    await screen.findByRole('link', { name: 'Tạo kế hoạch đầu tiên' });
    expect(screen.queryByText('Đang tải · Gợi ý hôm nay')).not.toBeInTheDocument();
    // Chưa lỗi thì cũng chưa được báo lỗi.
    expect(screen.queryByText('Không tải được gợi ý hôm nay.')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — không hồi quy ca đã có kế hoạch', () => {
  it('có plan active: khối "Gợi ý hôm nay" vẫn render như cũ', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan()]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: 'Bạn đã hoàn thành kế hoạch hôm nay 🎉' })
    );

    render(<DashboardPage />, LOGGED_IN);

    expect(await screen.findByText('Bạn đã hoàn thành kế hoạch hôm nay 🎉')).toBeInTheDocument();
    // Không rơi nhầm vào ca A1 — thẻ onboarding chỉ dành cho tài khoản 0 kế hoạch.
    expect(screen.queryByRole('link', { name: 'Tạo kế hoạch đầu tiên' })).not.toBeInTheDocument();
  });

  it('chỉ có plan draft: vẫn là "có kế hoạch", không phải A1', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan({ status: 'draft' })]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: 'Kế hoạch của bạn còn ở dạng nháp.' })
    );

    render(<DashboardPage />, LOGGED_IN);

    await waitFor(() => {
      expect(screen.getByText('Chưa có kế hoạch nào đang hoạt động.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Tạo kế hoạch đầu tiên' })).not.toBeInTheDocument();
  });
});
