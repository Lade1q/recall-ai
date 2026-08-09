import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewQueue } from './useReviewQueue';
import { reviewQueueApi } from '../api/review-queue.api';
import type { ReviewQueueItem, ReviewQueueListResponse } from '../types/review-queue.types';

vi.mock('../api/review-queue.api', () => ({
  reviewQueueApi: {
    getReviewQueue: vi.fn(),
    updateReviewQueueItem: vi.fn(),
    getToday: vi.fn(),
  },
  REVIEW_QUEUE_MAX_LIMIT: 50,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from 'sonner';

const PLAN_ID = 'plan-1';

function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    name: 'Mảng (Array)',
    planId: PLAN_ID,
    planName: 'Cấu trúc dữ liệu',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: 'Đến hạn ôn tập',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.4,
    status: 'pending',
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
    skippedItems: [],
    ...overrides,
  };
}

const getReviewQueue = () => vi.mocked(reviewQueueApi.getReviewQueue);
const updateReviewQueueItem = () => vi.mocked(reviewQueueApi.updateReviewQueueItem);

function mockPatchOnce(item: ReviewQueueItem, status: 'skipped' | 'pending') {
  updateReviewQueueItem().mockResolvedValueOnce({
    id: item.id ?? 'item-1',
    conceptId: item.conceptId,
    planId: PLAN_ID,
    status,
  });
}

/**
 * Đẩy hết microtask của các promise chain trong hook khi đang dùng fake timers.
 * `waitFor` không dùng được ở những chỗ đó — nó tự hẹn giờ bằng timer đã bị đóng băng.
 */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReviewQueue — initial load', () => {
  it('loads items on mount with includeSkipped: true', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));

    const { result } = renderHook(() => useReviewQueue(PLAN_ID));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([item]);
    expect(getReviewQueue()).toHaveBeenCalledWith(PLAN_ID, { includeSkipped: true });
  });

  it('sets hasError and stops loading on initial fetch failure', async () => {
    getReviewQueue().mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([]);
  });

  it('treats an absent skippedItems field as an empty array, not a crash', async () => {
    const response = makeResponse({ items: [makeItem()] });
    delete (response as { skippedItems?: unknown }).skippedItems;
    getReviewQueue().mockResolvedValueOnce(response);

    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.skippedItems).toEqual([]);
    expect(result.current.skippedItems.length).toBe(0);
  });
});

/**
 * DoD #225: "Gỡ một khái niệm → reload trang → vẫn đang bị gỡ". Việc ghi vì thế KHÔNG được hoãn
 * theo cửa sổ Hoàn tác — cửa sổ 6 giây chỉ là giao diện, PATCH phải đi ngay.
 */
describe('useReviewQueue — remove() ghi ngay, cửa sổ Hoàn tác chỉ là UI (edge case 1)', () => {
  it('PATCHes skipped immediately on click and keeps the row in place as the "gone" marker', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockPatchOnce(item, 'skipped');

    act(() => {
      result.current.remove(item);
    });

    await waitFor(() => expect(updateReviewQueueItem()).toHaveBeenCalledWith(item.id, 'skipped'));
    // Dòng vẫn ở nguyên chỗ cũ để bấm Hoàn tác, nhưng trên server nó đã là `skipped`.
    expect(result.current.items).toEqual([item]);
    expect(result.current.goneConceptIds.has(item.conceptId)).toBe(true);
  });

  it('moves the row into skippedItems when the 6s window closes, with no second PATCH', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.useFakeTimers();
    mockPatchOnce(item, 'skipped');
    getReviewQueue().mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [{ ...item, status: 'skipped' }] })
    );

    act(() => {
      result.current.remove(item);
    });
    await flush();
    expect(updateReviewQueueItem()).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6050);
    });

    expect(updateReviewQueueItem()).toHaveBeenCalledTimes(1); // vẫn đúng một lần
    expect(result.current.items).toEqual([]);
    expect(result.current.skippedItems).toEqual([{ ...item, status: 'skipped' }]);
    expect(result.current.goneConceptIds.has(item.conceptId)).toBe(false);
  });

  it('undo inside the window PATCHes pending — it reverses a write, not a timer', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.useFakeTimers();
    mockPatchOnce(item, 'skipped');

    act(() => {
      result.current.remove(item);
    });
    await flush();

    mockPatchOnce(item, 'pending');
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    act(() => {
      result.current.undoRemove(item);
    });
    await flush();

    expect(updateReviewQueueItem()).toHaveBeenNthCalledWith(2, item.id, 'pending');
    expect(result.current.goneConceptIds.has(item.conceptId)).toBe(false);
    expect(result.current.items).toEqual([item]);

    // Cửa sổ đã bị huỷ: hết 6 giây cũng không có gì rơi xuống nhóm đã gỡ.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.skippedItems).toEqual([]);
  });
});

describe('useReviewQueue — multiple independent removals (edge case 2)', () => {
  it('writes each removal immediately and closes each window on its own clock', async () => {
    const itemA = makeItem({ id: 'a', conceptId: 'concept-a', name: 'A' });
    const itemB = makeItem({ id: 'b', conceptId: 'concept-b', name: 'B' });
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [itemA, itemB] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.useFakeTimers();
    mockPatchOnce(itemA, 'skipped');

    act(() => result.current.remove(itemA));
    await flush();
    expect(updateReviewQueueItem()).toHaveBeenCalledTimes(1);

    // 3 giây sau mới gỡ B — cửa sổ của B bắt đầu từ đây, độc lập với A.
    mockPatchOnce(itemB, 'skipped');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    act(() => result.current.remove(itemB));
    await flush();

    expect(updateReviewQueueItem()).toHaveBeenCalledTimes(2);
    expect(result.current.goneConceptIds.has(itemA.conceptId)).toBe(true);
    expect(result.current.goneConceptIds.has(itemB.conceptId)).toBe(true);
    expect(result.current.items).toEqual([itemA, itemB]);

    getReviewQueue().mockResolvedValueOnce(
      makeResponse({ items: [itemB], skippedItems: [{ ...itemA, status: 'skipped' }] })
    );

    // Thêm 3 giây: cửa sổ của A đóng, của B còn 3 giây nữa.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3050);
    });

    expect(result.current.items).toEqual([itemB]);
    expect(result.current.goneConceptIds.has(itemB.conceptId)).toBe(true);
    expect(result.current.skippedItems).toEqual([{ ...itemA, status: 'skipped' }]);

    getReviewQueue().mockResolvedValueOnce(
      makeResponse({
        items: [],
        skippedItems: [
          { ...itemA, status: 'skipped' },
          { ...itemB, status: 'skipped' },
        ],
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3050);
    });

    expect(updateReviewQueueItem()).toHaveBeenCalledTimes(2); // không có PATCH nào phát sinh thêm
    expect(result.current.items).toEqual([]);
    expect(result.current.skippedItems).toHaveLength(2);
  });
});

describe('useReviewQueue — id === null fallback A3 item (edge case 3)', () => {
  it('remove() on a null-id item is a strict no-op', async () => {
    const fallbackItem = makeItem({ id: null, reason: 'spaced_repetition' });
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [fallbackItem] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.remove(fallbackItem);
    });

    expect(result.current.goneConceptIds.size).toBe(0);
    expect(result.current.items).toEqual([fallbackItem]);
    expect(updateReviewQueueItem()).not.toHaveBeenCalled();
  });

  it('restore() on a null-id item is a strict no-op', async () => {
    const fallbackSkipped = makeItem({ id: null, status: 'skipped' });
    getReviewQueue().mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [fallbackSkipped] })
    );
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.restore(fallbackSkipped);
    });

    expect(result.current.skippedItems).toEqual([fallbackSkipped]);
    expect(result.current.items).toEqual([]);
    expect(updateReviewQueueItem()).not.toHaveBeenCalled();
  });
});

describe('useReviewQueue — PATCH failure rollback (edge case 4)', () => {
  it('clears the "gone" marker and shows a toast when the remove PATCH rejects', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    updateReviewQueueItem().mockRejectedValueOnce(new Error('500'));

    act(() => {
      result.current.remove(item);
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Không gỡ được khỏi lịch. Vui lòng thử lại.')
    );
    expect(result.current.items).toEqual([item]);
    expect(result.current.skippedItems).toEqual([]);
    expect(result.current.goneConceptIds.has(item.conceptId)).toBe(false);
    expect(result.current.pendingConceptIds.has(item.conceptId)).toBe(false);
  });

  it('keeps the concept removed when undo fails — the write already happened', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.useFakeTimers();
    mockPatchOnce(item, 'skipped');
    act(() => {
      result.current.remove(item);
    });
    await flush();

    updateReviewQueueItem().mockRejectedValueOnce(new Error('500'));
    act(() => {
      result.current.undoRemove(item);
    });
    await flush();

    expect(toast.error).toHaveBeenCalledWith(
      'Không hoàn tác được. Khái niệm vẫn đang bị gỡ khỏi lịch.'
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.skippedItems).toEqual([{ ...item, status: 'skipped' }]);
    expect(result.current.goneConceptIds.has(item.conceptId)).toBe(false);
  });
});

describe('useReviewQueue — restore() failure rollback (edge case 5)', () => {
  it('rolls back to skippedItems and shows a toast when restore PATCH rejects', async () => {
    const skippedItem = makeItem({ status: 'skipped' });
    getReviewQueue().mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [skippedItem] })
    );
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    updateReviewQueueItem().mockRejectedValueOnce(new Error('500'));

    act(() => {
      result.current.restore(skippedItem);
    });

    await waitFor(() => expect(result.current.items).toEqual([]));
    await waitFor(() => expect(result.current.skippedItems).toEqual([skippedItem]));
    expect(toast.error).toHaveBeenCalledWith('Không đưa lại vào lịch được. Vui lòng thử lại.');
    expect(result.current.pendingConceptIds.has(skippedItem.conceptId)).toBe(false);
  });
});

describe('useReviewQueue — refetch after successful PATCH (edge case 7)', () => {
  it('calls getReviewQueue again after a successful restore, and trusts server order/state', async () => {
    const skippedItem = makeItem({ status: 'skipped' });
    getReviewQueue().mockResolvedValueOnce(
      makeResponse({ items: [], skippedItems: [skippedItem] })
    );
    const { result } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockPatchOnce(skippedItem, 'pending');
    const serverItem = { ...skippedItem, status: 'pending' as const, priority: 0.9 };
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [serverItem], skippedItems: [] }));

    act(() => {
      result.current.restore(skippedItem);
    });

    await waitFor(() => expect(getReviewQueue()).toHaveBeenCalledTimes(2));
    expect(getReviewQueue()).toHaveBeenLastCalledWith(PLAN_ID, { includeSkipped: true });

    // Final state comes straight from the server refetch (priority 0.9), not the client's
    // optimistic guess (which would have kept priority 0.5).
    await waitFor(() => expect(result.current.items).toEqual([serverItem]));
  });
});

/**
 * Ca đắt nhất của issue: rời trang giữa cửa sổ Hoàn tác. Việc gỡ phải đã nằm trên server TRƯỚC
 * khi unmount, và unmount chỉ được huỷ cái timer dọn giao diện.
 */
describe('useReviewQueue — unmount during the undo window (edge case 8)', () => {
  it('has already written the removal before unmount, and fires nothing afterwards', async () => {
    const item = makeItem();
    getReviewQueue().mockResolvedValueOnce(makeResponse({ items: [item] }));
    const { result, unmount } = renderHook(() => useReviewQueue(PLAN_ID));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.useFakeTimers();
    mockPatchOnce(item, 'skipped');

    act(() => {
      result.current.remove(item);
    });
    await flush();

    // Ghi xong ngay lúc bấm — đây là điều DoD đòi: reload/rời trang không làm mất thao tác.
    expect(updateReviewQueueItem()).toHaveBeenCalledWith(item.id, 'skipped');

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6050);
    });

    expect(updateReviewQueueItem()).toHaveBeenCalledTimes(1);
  });
});
