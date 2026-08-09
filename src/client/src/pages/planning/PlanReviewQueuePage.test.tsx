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
