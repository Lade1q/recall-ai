import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@/utils/test-utils';
import PlanReviewQueuePage from './PlanReviewQueuePage';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import type {
  ReviewQueueItem,
  ReviewQueueListResponse,
} from '@/features/review-queue/types/review-queue.types';
import type { PlanDetails } from '@/features/study-planner/types/concept';

vi.mock('@/features/review-queue/api/review-queue.api', () => ({
  reviewQueueApi: {
    getReviewQueue: vi.fn(),
    updateReviewQueueItem: vi.fn(),
    getToday: vi.fn(),
  },
  REVIEW_QUEUE_MAX_LIMIT: 50,
}));

vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { getPlan: vi.fn() },
}));

function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    name: 'Cây AVL',
    planId: 'plan-1',
    planName: 'Giải tích 1',
    priority: 0.42,
    reason: 'spaced_repetition',
    reasonText: 'Đã đến lịch ôn tập theo mức độ ghi nhớ',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.31,
    status: 'skipped',
    estimatedMinutes: 9,
    sourceSessionEndedAt: null,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<ReviewQueueListResponse> = {}): ReviewQueueListResponse {
  return {
    items: [],
    message: null,
    noScheduleNote: null,
    totalEstimatedMinutes: 0,
    ...overrides,
  };
}

const PLAN: PlanDetails = {
  id: 'plan-1',
  name: 'Giải tích 1',
  status: 'active',
  graph: { concepts: [], edges: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/plan/plan-1/review-queue');
  vi.mocked(planApi.getPlan).mockResolvedValue(PLAN);
});

/** `test-utils` chỉ bọc `BrowserRouter`, không khai báo route nào — render thẳng component thì
 *  `useParams()` rỗng và trang chạy với `planId = ''`, tức không test đúng thứ đang chạy thật. */
function renderPage() {
  return render(
    <Routes>
      <Route path="/plan/:id/review-queue" element={<PlanReviewQueuePage />} />
    </Routes>
  );
}

describe('PlanReviewQueuePage — empty-state disambiguation', () => {
  it('shows AllRemovedState (not EmptyQueueMessage) when items=[] but skippedItems is non-empty', async () => {
    const skipped = makeItem();
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({
        items: [],
        skippedItems: [skipped],
        // Server still returns the "completed plan" message here per the API contract —
        // the page must ignore it in this branch.
        message:
          'Bạn đã ôn hết kế hoạch này. Mỗi khái niệm có ngày ôn lại riêng, xa dần theo mức bạn nắm.',
      })
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Bạn đã gỡ tất cả khái niệm khỏi lịch')).toBeInTheDocument()
    );
    // The "all reviewed" empty state must NOT render.
    expect(screen.queryByText('Không còn khái niệm nào chờ ôn')).not.toBeInTheDocument();
    // The (ignored) server message text must not leak into the DOM either.
    expect(
      screen.queryByText(/Bạn đã ôn hết kế hoạch này\. Mỗi khái niệm/)
    ).not.toBeInTheDocument();
    // The skipped item itself is shown (group is open by default in AllRemovedState).
    expect(screen.getByText('Cây AVL')).toBeInTheDocument();
  });

  it('shows the verbatim server message (not a hardcoded string) when items=[] and skippedItems=[]', async () => {
    const CUSTOM_MESSAGE =
      'Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy.';
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [], message: CUSTOM_MESSAGE })
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(CUSTOM_MESSAGE)).toBeInTheDocument());
    expect(screen.queryByText('Bạn đã gỡ tất cả khái niệm khỏi lịch')).not.toBeInTheDocument();
  });

  it('renders the archived-plan message verbatim for a different plan.status branch', async () => {
    const ARCHIVED_MESSAGE = 'Kế hoạch này đã được lưu trữ. Bỏ lưu trữ để ôn tiếp.';
    vi.mocked(planApi.getPlan).mockResolvedValue({ ...PLAN, status: 'archived' });
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [], message: ARCHIVED_MESSAGE })
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(ARCHIVED_MESSAGE)).toBeInTheDocument());
    expect(screen.getByText('Kế hoạch này đang được lưu trữ')).toBeInTheDocument();
  });

  it('frames the draft-plan empty state around confirming the graph, not around finishing it', async () => {
    const DRAFT_MESSAGE =
      'Kế hoạch này đang chờ bạn xác nhận đồ thị khái niệm. Kiểm chứng xong, hàng đợi ôn sẽ bắt đầu chạy.';
    vi.mocked(planApi.getPlan).mockResolvedValue({ ...PLAN, status: 'draft' });
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [], message: DRAFT_MESSAGE })
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(DRAFT_MESSAGE)).toBeInTheDocument());
    // Tiêu đề "Không còn khái niệm nào chờ ôn" nói ngược với câu server ngay bên dưới nó.
    expect(screen.queryByText('Không còn khái niệm nào chờ ôn')).not.toBeInTheDocument();
    expect(screen.getByText('Hàng đợi ôn chưa bắt đầu chạy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kiểm chứng đồ thị' })).toHaveAttribute(
      'href',
      '/plan/plan-1/verify'
    );
  });

  /**
   * #345 — the two states #344 left without a sentence of their own. Both are driven by fields,
   * never by matching on `message`: the page must be able to tell them apart from a response
   * alone.
   */
  it('an empty graph gets its own frame, and never the congratulation tick', async () => {
    const EMPTY_GRAPH_MESSAGE =
      'Kế hoạch này hiện không có khái niệm nào, nên chưa có gì để ôn. Thêm khái niệm vào đồ thị hoặc phân tích lại tài liệu để bắt đầu.';
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({
        items: [],
        skippedItems: [],
        message: EMPTY_GRAPH_MESSAGE,
        hasActiveConcepts: false,
      })
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Đồ thị khái niệm đang trống')).toBeInTheDocument()
    );
    expect(screen.getByText(EMPTY_GRAPH_MESSAGE)).toBeInTheDocument();
    // The heading it must NOT borrow — a tick over an empty plan congratulates the student for
    // work they have not done, which is the whole reason #345 exists.
    expect(screen.queryByText('Không còn khái niệm nào chờ ôn')).not.toBeInTheDocument();
    // "Mở", not "Xem": the destination is right, the verb was promising something to look at.
    expect(screen.getByRole('link', { name: 'Mở đồ thị khái niệm' })).toHaveAttribute(
      'href',
      '/plan/plan-1'
    );
  });

  it('still shows the ordinary empty frame when the graph is intact', async () => {
    // The control for the case above: same empty list, opposite flag, old frame unchanged.
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [], message: '', hasActiveConcepts: true })
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Không còn khái niệm nào chờ ôn')).toBeInTheDocument()
    );
    expect(screen.queryByText('Đồ thị khái niệm đang trống')).not.toBeInTheDocument();
  });

  it('the suggestion banner says why the old schedule is gone, when the server says so', async () => {
    const CHANGED_NOTE =
      'Kế hoạch này đã được phân tích lại, nên những khái niệm trong lịch ôn trước đó không còn trong nội dung hiện tại. Làm một phiên với nội dung mới để có lịch thật.';
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      // `id: null` is what makes these A3 suggestions rather than a real schedule.
      makeResponse({ items: [makeItem({ id: null })], noScheduleNote: CHANGED_NOTE })
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(CHANGED_NOTE)).toBeInTheDocument());
    // The client's own sentence is for the never-graded case and must not appear beside it.
    expect(screen.queryByText(/chưa có kết quả vấn đáp nào/)).not.toBeInTheDocument();
    // The lead-in is shared by both — it is the banner, not the diagnosis.
    expect(screen.getByText('Đây là gợi ý, chưa phải lịch ôn của bạn.')).toBeInTheDocument();
    // …and the link back to review history, which `isFallbackSuggestion` alone used to hide here.
    // This student HAS history — that is the definition of this case — so hiding it removed a
    // route, silently, which is worse than the wrong sentence next to it.
    expect(screen.getByRole('link', { name: 'Lịch sử ôn tập' })).toBeInTheDocument();
  });

  it('falls back to the client sentence when there is no note — the never-graded case', async () => {
    // Byte-for-byte the previous fixture except `noScheduleNote`. That is the assertion, not a
    // coincidence: the two cases must be told apart by exactly ONE discriminator. Answer the
    // "has history?" question with a second flag and this pair stops flipping together — which
    // is how the bug being fixed here got in.
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({ items: [makeItem({ id: null })], noScheduleNote: null })
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/chưa có kết quả vấn đáp nào/)).toBeInTheDocument()
    );
    // "kết quả", not "phiên": a session abandoned before its first answer leaves no queue row,
    // so the old wording called it "no session" while the student remembered sitting one.
    expect(screen.queryByText(/chưa có phiên vấn đáp nào/)).not.toBeInTheDocument();
    // Genuinely no history here, so the link stays hidden — the flag's original job, unchanged.
    expect(screen.queryByRole('link', { name: 'Lịch sử ôn tập' })).not.toBeInTheDocument();
  });

  it('reads the plan name off the queue items instead of refetching the whole graph', async () => {
    vi.mocked(reviewQueueApi.getReviewQueue).mockResolvedValueOnce(
      makeResponse({ items: [makeItem({ status: 'pending' })], totalEstimatedMinutes: 9 })
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('Cây AVL')).toBeInTheDocument());
    expect(screen.getByText('Giải tích 1')).toBeInTheDocument();
    expect(planApi.getPlan).not.toHaveBeenCalled();
  });
});
