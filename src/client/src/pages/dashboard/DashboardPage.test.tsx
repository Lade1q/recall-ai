import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@/utils/test-utils';
import DashboardPage from './DashboardPage';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import { dashboardApi } from '@/features/dashboard/api/dashboard.api';
import type {
  ReviewQueueItem,
  ReviewQueueListResponse,
} from '@/features/review-queue/types/review-queue.types';
import type { PlanSummary } from '@/features/study-planner/types/concept';

/**
 * Ba nguồn dữ liệu độc lập của Dashboard đều bị mock: trang đọc `/review-queue/today`,
 * `/dashboard/stats` và `/plans` qua ba `useAsyncResource` riêng, không cái nào chạm backend
 * thật được trong jsdom. Mock cả ba mới dựng lại được đúng các tổ hợp trạng thái bên dưới.
 */
vi.mock('@/features/review-queue/api/review-queue.api', () => ({
  // `snoozeReviewQueueItem` là bước ĐẦU của đường "hoãn": `TodayNudge` gọi nó, rồi mới gọi
  // `onChanged`. Không mock thì cú bấm chết ở lời gọi mạng và không tới được cái dây đang đo.
  reviewQueueApi: { getToday: vi.fn(), snoozeReviewQueueItem: vi.fn() },
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

function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    name: 'Ngăn xếp',
    planId: 'plan-1',
    planName: 'Mạng máy tính',
    priority: 0.42,
    reason: 'traceback',
    reasonText: "Nền tảng của 'Duyệt đồ thị DFS' mà bạn còn yếu",
    sourceConceptName: 'Duyệt đồ thị DFS',
    depth: 1,
    masteryScore: 0.31,
    status: 'pending',
    estimatedMinutes: 14,
    sourceSessionEndedAt: null,
    ...overrides,
  };
}

const EMPTY_STATS = {
  studyStreakDays: 0,
  weeklyStudyMinutes: 0,
  conceptsMastered: 0,
  conceptsTotal: 0,
};

/** Khác EMPTY_STATS ở cả ba ô ⇒ `statsAllZero` sai ⇒ dải chỉ số HIỆN. `1h 35m` (95 phút) là chuỗi
 *  chỉ ra đời khi số của `/dashboard/stats` đi hết đường tới `StatStrip`. */
const LOADED_STATS = {
  studyStreakDays: 5,
  weeklyStudyMinutes: 95,
  conceptsMastered: 3,
  conceptsTotal: 12,
};
const LOADED_STATS_TEXT = '1h 35m';

/** Câu backend cho ca "có kế hoạch nhưng còn draft" — dùng làm mốc "khối gợi ý đã tải xong". */
const DRAFT_MESSAGE = 'Kế hoạch của bạn còn ở dạng nháp.';
const NO_ACTIVE_PLAN_TEXT = 'Chưa có kế hoạch nào đang hoạt động.';

/**
 * Đếm ô giữ chỗ đang nhấp nháy trong CẢ trang. Ba skeleton của Dashboard đều `aria-hidden` và
 * KHÔNG có chữ (trừ khối gợi ý), nên trong jsdom — vốn không có layout — sự hiện diện trong DOM
 * là thứ duy nhất quan sát được. Cùng cách `App.test.tsx` đọc `.animate-spin`.
 *
 * Chỉ có nghĩa khi hai nguồn còn lại ĐÃ lắng: xem test "chứng dụng cụ" ở cuối describe, nó đo
 * đúng bố cục này với cả ba nguồn xong và đòi số 0.
 */
const pulseCount = (container: HTMLElement) => container.querySelectorAll('.animate-pulse').length;

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

    // Thân bài phải là chuỗi của server, không phải copy client. Quy tắc ở mockup
    // `claude-design/screen-dashboard.html`, khối A2b — KHÔNG phải #273/#278: #278 là một PR
    // chứ không phải issue, và #273 chỉ cấm SERVER trả fallback, không nói gì về client (#446).
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
   * Test trên khoá nút "Thử lại" CÓ MẶT; test này khoá nó CHẠY ĐƯỢC — hai chuyện khác nhau.
   * Đo đột biến ở #446 cho thấy cắt dây `onRetry={today.reload}` thành `onRetry={() => {}}` vẫn
   * xanh toàn bộ: cả #389 tồn tại vì tài khoản 0 kế hoạch mất ĐƯỜNG PHỤC HỒI, nên "nút có mặt"
   * là triệu chứng, "nút gọi lại được API" mới là cách chữa.
   */
  it('🔴 bấm "Thử lại" gọi lại API và thẻ hồi phục tại chỗ, không cần F5', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getToday)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(makeTodayResponse());

    render(<DashboardPage />, LOGGED_IN);

    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));

    // Dây `onRetry` phải chạy tới đúng nguồn của khối này.
    await waitFor(() => expect(reviewQueueApi.getToday).toHaveBeenCalledTimes(2));

    // Và hồi phục về đúng ca A1 gộp: câu server hiện ra, khối lỗi biến mất.
    expect(await screen.findByText(NO_PLAN_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Không tải được gợi ý hôm nay.')).not.toBeInTheDocument();
  });

  /**
   * Bất biến `DashboardPage.tsx:35` tự viết ra: *"`plans` chưa tải xong: chưa biết ca nào thì
   * không được đoán."* Đổi `isBrandNewAccount` sang `plans.data === null || …` là đoán, và trước
   * test này thì không có gì đỏ (#446). Đoán sai làm khối gợi ý biến mất ở tài khoản CÓ kế hoạch
   * trong suốt lúc `/plans` còn đang bay.
   */
  it('plans chưa tải xong: KHÔNG đoán là tài khoản trống, khối gợi ý vẫn hiện', async () => {
    vi.mocked(planApi.listPlans).mockReturnValue(new Promise(() => {}));
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: 'Bạn đã hoàn thành kế hoạch hôm nay 🎉' })
    );

    render(<DashboardPage />, LOGGED_IN);

    expect(await screen.findByText('Bạn đã hoàn thành kế hoạch hôm nay 🎉')).toBeInTheDocument();
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

  /**
   * Nhánh `TodayNudgeSkeleton` không được test nào ghim trước #446 — bỏ hẳn nó vẫn xanh, và hậu
   * quả là khối gợi ý trống trơn trong suốt lúc `/review-queue/today` còn bay thay vì báo "đang
   * tải". Đây là nửa còn lại của cặp "rỗng hay đang tải" mà ca A1 ở trên khoá nửa kia.
   */
  it('có plan + today đang tải: hiện skeleton khối gợi ý', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan()]);
    vi.mocked(reviewQueueApi.getToday).mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />, LOGGED_IN);

    expect(await screen.findByText('Đang tải · Gợi ý hôm nay')).toBeInTheDocument();
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

/**
 * Ba nguồn của Dashboard mỗi cái có HAI dây phải nối: nút "Thử lại" của `BlockError` → `reload`
 * của đúng nguồn đó, và nhánh skeleton → trạng thái "đang tải" của đúng nguồn đó. #446/#452 mới
 * ghim được nửa của khối `today`; đo đột biến trên `main` sau #452 cho thấy bốn dây còn lại cắt
 * đứt vẫn xanh 411/411 (#454).
 *
 * Mỗi test dưới đây giữ CẢ HAI vế mà #452 đo được là KHÔNG chồng lấn:
 *  - `toHaveBeenCalledTimes(2)` — dây có nối tới đúng nguồn không (mock luôn-hỏng vẫn xanh vế này);
 *  - một assertion hồi phục — UI có đi tiếp sau khi dữ liệu về không (cắt dây cũng đủ làm nó đỏ).
 * Bỏ vế nào cũng mất một lớp.
 */
describe('DashboardPage — mỗi khối tự phục hồi được (#454)', () => {
  /**
   * ⭐ Dây SINH ĐÔI của `onRetry`, cách nó 4 dòng, cùng khối, cùng `today.reload` — và lọt qua
   * cả review PR #452. `onChanged` là đường đọc lại sau khi hoãn / bỏ qua một mục (DB-09 #233):
   * cắt nó thì PATCH vẫn đi, toast vẫn báo "Sẽ nhắc lại vào ngày mai", nhưng danh sách đứng im —
   * mục vừa hoãn còn nguyên trên màn, đúng kiểu hỏng mà người dùng đọc thành "bấm không ăn".
   *
   * `TodayNudge.test.tsx` đã khoá phía component (bấm → PATCH → gọi `onChanged`). Cái CHƯA ai
   * khoá là `DashboardPage` có cắm `onChanged` vào `today.reload` hay không — hai chuyện khác
   * nhau, và đây là chuyện thứ hai.
   */
  it('🔴 hoãn một gợi ý: khối gợi ý tự đọc lại hàng đợi, không cần F5', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan()]);
    vi.mocked(reviewQueueApi.getToday)
      .mockResolvedValueOnce(makeTodayResponse({ items: [makeItem()], totalEstimatedMinutes: 14 }))
      .mockResolvedValue(makeTodayResponse({ message: 'Bạn đã hoàn thành kế hoạch hôm nay 🎉' }));
    vi.mocked(reviewQueueApi.snoozeReviewQueueItem).mockResolvedValue({
      id: 'item-1',
      conceptId: 'concept-1',
      planId: 'plan-1',
      status: 'pending',
      scheduledFor: '2026-08-30T17:00:00.000Z',
      changed: true,
    });

    render(<DashboardPage />, LOGGED_IN);

    fireEvent.click(await screen.findByRole('button', { name: 'Hoãn đến mai' }));

    // Dây `onChanged` phải chạy tới đúng nguồn của khối này — không phải `/plans`, không phải
    // `/dashboard/stats`: hoãn chỉ đổi hàng đợi hôm nay.
    await waitFor(() => expect(reviewQueueApi.getToday).toHaveBeenCalledTimes(2));
    expect(planApi.listPlans).toHaveBeenCalledTimes(1);
    expect(dashboardApi.getStats).toHaveBeenCalledTimes(1);

    // Và khối đi tiếp: hàng đợi rỗng sau khi hoãn mục cuối ⇒ chuyển sang trạng thái "xong hôm
    // nay", mục vừa hoãn biến mất.
    expect(await screen.findByText('Bạn đã hoàn thành kế hoạch hôm nay 🎉')).toBeInTheDocument();
    expect(screen.queryByText('Ngăn xếp')).not.toBeInTheDocument();
  });

  /**
   * `/plans` và `/review-queue/today` về bình thường ⇒ trên trang chỉ có ĐÚNG MỘT nút "Thử lại",
   * nên `getByRole` không cần lọc thêm và cũng không thể bấm nhầm nút của khối khác. Kế hoạch để
   * `draft` để mini Concept Graph không render (nó có skeleton nhấp nháy riêng).
   */
  it('🔴 bấm "Thử lại" ở dải chỉ số: gọi lại /dashboard/stats và dải hiện ra tại chỗ', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan({ status: 'draft' })]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: DRAFT_MESSAGE })
    );
    vi.mocked(dashboardApi.getStats)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(LOADED_STATS);

    render(<DashboardPage />, LOGGED_IN);

    expect(await screen.findByText('Không tải được các chỉ số nhanh.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(dashboardApi.getStats).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(LOADED_STATS_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('Không tải được các chỉ số nhanh.')).not.toBeInTheDocument();
  });

  /**
   * Ở đây `stats` để nguyên EMPTY_STATS của `beforeEach` ⇒ `statsAllZero` ⇒ dải chỉ số ẩn hẳn,
   * nên lại chỉ còn ĐÚNG MỘT nút "Thử lại" trên trang.
   */
  it('🔴 bấm "Thử lại" ở danh mục kế hoạch: gọi lại /plans và danh mục hiện ra tại chỗ', async () => {
    vi.mocked(planApi.listPlans)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue([makePlan()]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: DRAFT_MESSAGE })
    );

    render(<DashboardPage />, LOGGED_IN);

    expect(await screen.findByText('Không tải được danh mục kế hoạch.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(planApi.listPlans).toHaveBeenCalledTimes(2));

    // Nhãn của thẻ kế hoạch, không phải chữ "Mạng máy tính" trần: tên kế hoạch còn xuất hiện ở
    // mini Concept Graph nữa, so chuỗi trần sẽ khớp nhiều nơi.
    expect(
      await screen.findByRole('link', { name: 'Mở kế hoạch Mạng máy tính' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh mục kế hoạch.')).not.toBeInTheDocument();
  });

  /**
   * Bỏ nhánh `StatStripSkeleton` thì ternary rơi về `stats.data ? … : null` ⇒ `null` ⇒ khối trống
   * trơn suốt lúc `/dashboard/stats` còn bay. Không có chữ nào để bắt (skeleton là ô xám
   * `aria-hidden`), nên đo bằng sự hiện diện trong DOM.
   *
   * Đợi HAI nguồn kia lắng trước rồi mới đếm: sau đó ô nhấp nháy còn lại chỉ có thể là của khối
   * chỉ số — kế hoạch `draft` ⇒ không thẻ kế hoạch, không mini graph; khối gợi ý đã có chữ.
   */
  it('🔴 /dashboard/stats đang tải: dải chỉ số hiện skeleton chứ không trống trơn', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan({ status: 'draft' })]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: DRAFT_MESSAGE })
    );
    vi.mocked(dashboardApi.getStats).mockReturnValue(new Promise(() => {}));

    const { container } = render(<DashboardPage />, LOGGED_IN);

    await screen.findByText(DRAFT_MESSAGE);
    await screen.findByText(NO_ACTIVE_PLAN_TEXT);

    expect(pulseCount(container)).toBeGreaterThan(0);
    // Đang tải thì chưa được hiện số, cũng chưa được báo lỗi.
    expect(screen.queryByText('ngày ôn liên tiếp')).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được các chỉ số nhanh.')).not.toBeInTheDocument();
  });

  /** Nửa còn lại của cặp trên, ở khối danh mục kế hoạch. */
  it('🔴 /plans đang tải: khối danh mục hiện skeleton chứ không trống trơn', async () => {
    vi.mocked(planApi.listPlans).mockReturnValue(new Promise(() => {}));
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: DRAFT_MESSAGE })
    );
    vi.mocked(dashboardApi.getStats).mockResolvedValue(LOADED_STATS);

    const { container } = render(<DashboardPage />, LOGGED_IN);

    await screen.findByText(DRAFT_MESSAGE);
    await screen.findByText(LOADED_STATS_TEXT);

    expect(pulseCount(container)).toBeGreaterThan(0);
    // Chưa biết có kế hoạch hay không thì chưa được đoán sang thẻ onboarding, cũng chưa báo lỗi.
    expect(screen.queryByRole('link', { name: 'Tạo kế hoạch đầu tiên' })).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh mục kế hoạch.')).not.toBeInTheDocument();
  });

  /**
   * 🔴 Vế `&& today.data === null` của `todayFailed`. Issue #454 mục 3 đoán nó không có hành vi
   * quan sát được — đúng cho CỔNG `<section>` (ở đó chỉ tài khoản 0 kế hoạch mới cần tới nó, và
   * tài khoản đó chưa từng mount được nút nào để gọi `reload`), nhưng `todayFailed` còn dùng ở
   * NHÁNH `BlockError` bên trong, nơi tài khoản không bị giới hạn như vậy.
   *
   * Đường tới trạng thái đó: tài khoản CÓ kế hoạch → hoãn một mục → `onChanged` đọc lại → lần
   * đọc lại hỏng. `useAsyncResource` cố ý giữ `data` cũ ("để nội dung đang hiển thị không biến
   * mất"), nên `error === true` mà `data !== null`. Bỏ vế kia đi thì cả khối gợi ý bị thay bằng
   * `BlockError` — người dùng mất luôn danh sách đang đọc vì một lần refetch nền hỏng.
   */
  it('🔴 reload hỏng sau khi đã có dữ liệu: giữ nội dung cũ, KHÔNG nuốt nó bằng khối lỗi', async () => {
    let rejectSecondRead!: (reason: unknown) => void;
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan()]);
    vi.mocked(reviewQueueApi.getToday)
      .mockResolvedValueOnce(makeTodayResponse({ items: [makeItem()], totalEstimatedMinutes: 14 }))
      .mockReturnValue(
        new Promise((_, reject) => {
          rejectSecondRead = reject;
        })
      );
    vi.mocked(reviewQueueApi.snoozeReviewQueueItem).mockResolvedValue({
      id: 'item-1',
      conceptId: 'concept-1',
      planId: 'plan-1',
      status: 'pending',
      scheduledFor: '2026-08-30T17:00:00.000Z',
      changed: true,
    });

    render(<DashboardPage />, LOGGED_IN);

    fireEvent.click(await screen.findByRole('button', { name: 'Hoãn đến mai' }));
    await waitFor(() => expect(reviewQueueApi.getToday).toHaveBeenCalledTimes(2));

    // Đẩy lỗi vào TRONG `act` để `setState` của nhánh `.catch` chảy hết trước khi hỏi màn hình —
    // "thứ không được có mặt" chỉ hỏi được sau một mốc lắng chắc chắn, không phải sau `waitFor`
    // của lời gọi (lời gọi xảy ra trước lúc promise từ chối).
    await act(async () => {
      rejectSecondRead(new Error('network down'));
    });

    // Tiêu đề khối, không phải chuỗi trần: tên khái niệm còn xuất hiện lần nữa trong cột hàng đợi.
    expect(screen.getByRole('heading', { name: 'Ngăn xếp' })).toBeInTheDocument();
    expect(screen.queryByText('Không tải được gợi ý hôm nay.')).not.toBeInTheDocument();
  });

  /**
   * 🧪 Chứng DỤNG CỤ, không phải chứng sản phẩm. Hai test trên đòi `pulseCount > 0`; nếu bố cục
   * này còn một ô `.animate-pulse` nào khác thì chúng xanh mà chẳng giữ gì. Test này chạy ĐÚNG
   * bố cục đó với cả ba nguồn đã lắng và đòi số 0 — nên `> 0` ở trên chỉ có thể đến từ chính
   * nguồn bị treo, và phép đo có đường để SAI.
   */
  it('🧪 ba nguồn đã tải xong: không còn ô nhấp nháy nào (chứng dụng cụ đọc được số 0)', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan({ status: 'draft' })]);
    vi.mocked(reviewQueueApi.getToday).mockResolvedValue(
      makeTodayResponse({ message: DRAFT_MESSAGE })
    );
    vi.mocked(dashboardApi.getStats).mockResolvedValue(LOADED_STATS);

    const { container } = render(<DashboardPage />, LOGGED_IN);

    await screen.findByText(DRAFT_MESSAGE);
    await screen.findByText(NO_ACTIVE_PLAN_TEXT);
    await screen.findByText(LOADED_STATS_TEXT);

    expect(pulseCount(container)).toBe(0);
  });
});

/**
 * #445 — hai cơ chế làm tài khoản 0 kế hoạch nhìn thấy một thẻ **trông như đã tải xong nhưng
 * rỗng ruột**. Cả hai chỉ lộ ra khi `/review-queue/today` về CHẬM HƠN `/plans`; ở localhost
 * khoảng đó đo được `-3ms` nên không ca nào trước đây chạm tới. Dựng lại bằng một promise không
 * bao giờ resolve — cùng khuôn `mockReturnValue(new Promise(() => {}))` các ca trên đã dùng.
 */
describe('DashboardPage — khoảng câm của thẻ onboarding (#445)', () => {
  /**
   * Cơ chế ① — chữ của thẻ đến từ endpoint KHÁC với thẻ. `PlanCatalog` lấy thân bài từ
   * `today.data?.message`, nên trong lúc `/review-queue/today` còn bay thì thẻ đã dựng xong mà
   * thân bài rỗng: không skeleton, không lỗi, không tín hiệu nào phân biệt *đang chờ* với
   * *server bảo rỗng*. Đo ở issue: thẻ câm 79→879ms ở mức trễ 800ms.
   */
  it('🔴 today chưa về: thẻ onboarding báo ĐANG TẢI, không phải thân bài trống câm', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getToday).mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />, LOGGED_IN);

    const cta = await screen.findByRole('link', { name: 'Tạo kế hoạch đầu tiên' });
    const card = cta.closest('div');

    // Hai vế, khoá CẢ HAI: vạch cho người nhìn màn hình, `role="status"` cho người dùng trình
    // đọc màn hình. Bỏ riêng vế thị giác thì vế kia vẫn xanh — cùng cái bẫy "nút có mặt ≠ nút
    // chạy được" của #446 ở dạng khác.
    //
    // Đếm TRONG thẻ chứ không cả trang: ở nhịp này `/dashboard/stats` cũng chưa lắng, và tổng
    // vạch của hai khối KIA trùng khít số vạch của khối đang kiểm — một phép đếm toàn trang sẽ
    // xanh cả khi thẻ không vẽ gì.
    expect(pulseCount(card as HTMLElement)).toBe(1);
    // Khoá NỘI DUNG của live region, không khoá sự tồn tại: vùng `role="status"` ở khối này gắn
    // vô điều kiện và chỉ đổi chữ bên trong — WAI-ARIA đòi vùng có mặt TRƯỚC khi nội dung đổi
    // (repo còn dùng cả khuôn có điều kiện ở chỗ khác; bảng phân loại nằm ở `PlanCatalog`).
    // `getByRole('status')` một mình sẽ xanh cả với bản mount có điều kiện, nên phải hỏi chữ.
    //
    // Hỏi TRONG thẻ, cùng lý do đã hỏi `pulseCount` trong thẻ: một assertion chữ quét cả trang
    // bị bất kỳ component nào ở bất kỳ đâu render cùng chuỗi lật đổ — và `TodayNudgeSkeleton`
    // ngay trên đầu màn này có một chuỗi "Đang tải …" của riêng nó.
    expect(within(card as HTMLElement).getByRole('status')).toHaveTextContent(
      'Đang tải gợi ý hôm nay'
    );
  });

  /**
   * Đối chứng âm, và chốt chặn cho cách sửa quá tay: ca LỖI vẫn phải im. `BlockError` + "Thử
   * lại" ngay phía trên đã nói chuyện hỏng đúng một lần; nói lần hai bằng một vạch đang chạy là
   * sai sự thật — không có gì đang tải cả.
   */
  it('today LỖI: thân bài trống như cũ, không có vạch tải nào', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getToday).mockRejectedValue(new Error('network down'));

    render(<DashboardPage />, LOGGED_IN);

    expect(await screen.findByText('Không tải được gợi ý hôm nay.')).toBeInTheDocument();

    // Vùng live vẫn ở đó (gắn vô điều kiện, để lần sau chữ đổi là có vùng nhận) nhưng KHÔNG
    // nói gì: không có gì đang tải, và chuyện hỏng đã được `BlockError` nói đúng một lần ở
    // trên. Khoá NỘI DUNG
    // chứ không khoá sự vắng mặt — bản cũ dùng `queryByRole(...).not.toBeInTheDocument()`, và
    // chính assertion đó CẤM khuôn gắn-vô-điều-kiện mà mã bây giờ dùng.
    const card = screen.getByRole('link', { name: 'Tạo kế hoạch đầu tiên' }).closest('div');
    expect(within(card as HTMLElement).getByRole('status')).toHaveTextContent('');
    expect(within(card as HTMLElement).queryByText(/Đang tải/)).not.toBeInTheDocument();
  });

  /**
   * Cơ chế ② — nặng hơn, và nó có SẴN TRƯỚC #408. `useAsyncResource.reload()` từng hạ `error` về
   * `false` ngay lúc bấm, nên trong lúc lần tải lại còn bay thì trạng thái trùng khít ca *tải
   * lần đầu* (`{data: null, loading: true, error: false}`): cổng `todayFailed` tắt, cả
   * `<section>` unmount, **nút vừa bấm biến mất** — và chỉ quay lại nếu request hỏng LẦN NỮA.
   */
  it('🔴 bấm "Thử lại" lúc mạng chậm: khối gợi ý KHÔNG biến mất, nó chuyển sang đang tải', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([]);
    vi.mocked(reviewQueueApi.getToday)
      .mockRejectedValueOnce(new Error('network down'))
      .mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />, LOGGED_IN);

    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(reviewQueueApi.getToday).toHaveBeenCalledTimes(2));

    // Khối vẫn trên màn, ở dạng "đang tải" — không bốc hơi cùng cái nút vừa bấm.
    expect(screen.getByText('Đang tải · Gợi ý hôm nay')).toBeInTheDocument();
  });

  /**
   * Mặt kia của `todayPending`, và là bất biến `useAsyncResource` tự khai: *"`data` cũ được giữ
   * lại khi tải lại … để nội dung đang hiển thị không biến mất."* Bỏ vế `&& today.data === null`
   * khỏi `todayPending` thì MỌI lần đọc lại — kể cả lần sau khi hoãn một mục — giật khối gợi ý
   * về skeleton, tức nội dung đang đọc biến mất trong lúc chẳng có gì hỏng.
   *
   * Song song với ca `todayFailed` mà #454 vừa ghim: cùng một vế, cùng lý do, ở hằng anh em.
   */
  it('🔴 đọc lại khi ĐÃ CÓ dữ liệu: giữ nguyên nội dung, không giật về skeleton', async () => {
    vi.mocked(planApi.listPlans).mockResolvedValue([makePlan({ status: 'draft' })]);
    vi.mocked(reviewQueueApi.getToday)
      .mockResolvedValueOnce(makeTodayResponse({ items: [makeItem()], totalEstimatedMinutes: 14 }))
      .mockReturnValue(new Promise(() => {}));
    vi.mocked(reviewQueueApi.snoozeReviewQueueItem).mockResolvedValue({
      id: 'item-1',
      conceptId: 'concept-1',
      planId: 'plan-1',
      status: 'pending',
      scheduledFor: '2026-08-30T17:00:00.000Z',
      changed: true,
    });

    render(<DashboardPage />, LOGGED_IN);

    fireEvent.click(await screen.findByRole('button', { name: 'Hoãn đến mai' }));
    await waitFor(() => expect(reviewQueueApi.getToday).toHaveBeenCalledTimes(2));

    // Lần đọc lại còn đang bay, nhưng khối vẫn là khối gợi ý THẬT với đủ lối thoát của nó — hỏi
    // theo nút vì tên khái niệm và câu lý do đều xuất hiện ở nhiều chỗ trong khối.
    expect(screen.getByRole('button', { name: 'Hoãn đến mai' })).toBeInTheDocument();
    expect(screen.queryByText('Đang tải · Gợi ý hôm nay')).not.toBeInTheDocument();
  });
});
