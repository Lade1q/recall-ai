import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/utils/test-utils';
import { TodayNudge } from './TodayNudge';
import { reviewQueueApi } from '@/features/review-queue/api/review-queue.api';
import type {
  ReviewQueueItem,
  ReviewQueueListResponse,
} from '@/features/review-queue/types/review-queue.types';

vi.mock('@/features/review-queue/api/review-queue.api', () => ({
  reviewQueueApi: {
    getToday: vi.fn(),
    getReviewQueue: vi.fn(),
    updateReviewQueueItem: vi.fn(),
    snoozeReviewQueueItem: vi.fn(),
  },
  REVIEW_QUEUE_MAX_LIMIT: 50,
}));

function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    name: 'Ngăn xếp',
    planId: 'plan-1',
    planName: 'Cấu trúc dữ liệu',
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

function makeResponse(overrides: Partial<ReviewQueueListResponse> = {}): ReviewQueueListResponse {
  return {
    items: [makeItem()],
    message: null,
    totalEstimatedMinutes: 14,
    ...overrides,
  };
}

const snoozeButton = () => screen.getByRole('button', { name: 'Hoãn đến mai' });
const skipButton = () => screen.getByRole('button', { name: 'Bỏ qua gợi ý' });

type SnoozeResult = Awaited<ReturnType<typeof reviewQueueApi.snoozeReviewQueueItem>>;
type UpdateResult = Awaited<ReturnType<typeof reviewQueueApi.updateReviewQueueItem>>;

/** `scheduledFor` = 00:00 ngày mai giờ VN do server chốt — client chỉ đọc về, không tự tính. */
const SNOOZED: SnoozeResult = {
  id: 'item-1',
  conceptId: 'concept-1',
  planId: 'plan-1',
  status: 'pending',
  scheduledFor: '2026-08-09T17:00:00.000Z',
};

const SKIPPED: UpdateResult = {
  id: 'item-1',
  conceptId: 'concept-1',
  planId: 'plan-1',
  status: 'skipped',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TodayNudge — hai lối thoát DB-09 (#233)', () => {
  /**
   * Khoá cả hai nút trong lúc một PATCH đang bay: hai nút đụng CÙNG một hàng và đổi hai thứ
   * ngược nhau (giữ trên lịch / gỡ khỏi lịch), nên bấm chồng lên nhau thì kết quả cuối tuỳ thứ
   * tự response về. Đây là ca chỉ tồn tại giữa lúc bấm và lúc server trả lời — không chụp được
   * bằng tay trên môi trường thật, nên phải khoá bằng một promise chưa resolve.
   */
  it('khoá CẢ HAI nút trong lúc PATCH chưa trả lời, và chỉ nút đang chạy mang aria-busy', async () => {
    let resolveSnooze!: (value: SnoozeResult) => void;
    vi.mocked(reviewQueueApi.snoozeReviewQueueItem).mockReturnValue(
      new Promise<SnoozeResult>((resolve) => {
        resolveSnooze = resolve;
      })
    );
    const onChanged = vi.fn();

    render(<TodayNudge data={makeResponse()} onChanged={onChanged} />);
    fireEvent.click(snoozeButton());

    await waitFor(() => expect(snoozeButton()).toBeDisabled());
    expect(skipButton()).toBeDisabled();
    expect(snoozeButton()).toHaveAttribute('aria-busy', 'true');
    // Nút không chạy phải im lặng: `aria-busy` trên cả hai sẽ báo cho screen reader rằng "bỏ
    // qua" cũng đang được thực hiện — nó chỉ đang bị khoá.
    expect(skipButton()).not.toHaveAttribute('aria-busy');
    // Khoá chứ không gửi: cú bấm thứ hai trong lúc chờ không được thành một PATCH nữa.
    fireEvent.click(skipButton());
    expect(reviewQueueApi.updateReviewQueueItem).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();

    resolveSnooze(SNOOZED);

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(snoozeButton()).toBeEnabled();
    expect(skipButton()).toBeEnabled();
    expect(snoozeButton()).not.toHaveAttribute('aria-busy');
  });

  // Hai hành vi khác nhau ⇒ hai lời gọi khác nhau. Gộp nhầm thành một là hỏng cả hai (#233).
  it('gửi đúng hai lời gọi khác nhau: hoãn → snooze, bỏ qua → status skipped', async () => {
    vi.mocked(reviewQueueApi.snoozeReviewQueueItem).mockResolvedValue(SNOOZED);
    vi.mocked(reviewQueueApi.updateReviewQueueItem).mockResolvedValue(SKIPPED);
    const onChanged = vi.fn();

    const { unmount } = render(<TodayNudge data={makeResponse()} onChanged={onChanged} />);
    fireEvent.click(snoozeButton());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    expect(reviewQueueApi.snoozeReviewQueueItem).toHaveBeenCalledWith('item-1');
    expect(reviewQueueApi.updateReviewQueueItem).not.toHaveBeenCalled();

    unmount();
    render(<TodayNudge data={makeResponse()} onChanged={onChanged} />);
    fireEvent.click(skipButton());
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));

    expect(reviewQueueApi.updateReviewQueueItem).toHaveBeenCalledWith('item-1', 'skipped');
    expect(reviewQueueApi.snoozeReviewQueueItem).toHaveBeenCalledTimes(1);
  });

  // PATCH hỏng thì gợi ý phải còn nguyên: không có optimistic removal nào để cuộn lại, và mở
  // khoá nút để bấm lại được.
  it('giữ nguyên gợi ý và mở khoá nút khi PATCH lỗi, không gọi onChanged', async () => {
    vi.mocked(reviewQueueApi.snoozeReviewQueueItem).mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChanged = vi.fn();

    render(<TodayNudge data={makeResponse()} onChanged={onChanged} />);
    fireEvent.click(snoozeButton());

    await waitFor(() => expect(snoozeButton()).toBeEnabled());
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Ngăn xếp' })).toBeInTheDocument();
    expect(skipButton()).toBeEnabled();
  });

  /**
   * Gợi ý ảo A3-fallback (`id: null`) không có hàng thật để hoãn hay gỡ. Ẩn hẳn hai nút thay vì
   * để chúng vô hiệu hoá — nút xám không nói được vì sao nó xám.
   *
   * Ca này KHÔNG tới được qua `/review-queue/today` (từ #273, mục fallback không có
   * `scheduledFor` nên không bao giờ "đến hạn"); test giữ vì kiểu dữ liệu vẫn cho phép `null` và
   * lá chắn thật là 404 của backend.
   */
  it('ẩn cả hai lối thoát cho mục A3-fallback (id === null)', () => {
    render(
      <TodayNudge data={makeResponse({ items: [makeItem({ id: null })] })} onChanged={vi.fn()} />
    );

    expect(screen.getByRole('heading', { name: 'Ngăn xếp' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoãn đến mai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ qua gợi ý' })).not.toBeInTheDocument();
    // Hai CTA chính vẫn còn — ẩn lối thoát không được kéo theo đường đi tiếp.
    expect(screen.getByRole('link', { name: 'Bắt đầu Focus Session' })).toBeInTheDocument();
  });
});
