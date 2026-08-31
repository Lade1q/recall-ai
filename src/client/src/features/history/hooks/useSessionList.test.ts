import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { historyApi, PAGE_SIZE } from '../api/history.api';
import type { InterviewSessionListItem } from '../types/history.types';
import { useSessionList } from './useSessionList';

vi.mock('../api/history.api', () => ({
  PAGE_SIZE: 20,
  historyApi: { listInterviews: vi.fn() },
}));

const listInterviews = vi.mocked(historyApi.listInterviews);

function session(index: number, status: InterviewSessionListItem['status'] = 'completed') {
  return {
    id: `session-${index}`,
    startedAt: new Date(2026, 7, 30, 12, 0, -index).toISOString(),
    endedAt: status === 'completed' ? new Date(2026, 7, 30, 12, 1, -index).toISOString() : null,
    status,
    fallbackMode: false,
    plan: { id: 'plan-1', name: 'Kế hoạch 1' },
    conceptTotal: 1,
    averageMasteryScore: 0.7,
    concepts: [],
  } satisfies InterviewSessionListItem;
}

function page(from: number, count: number, status?: InterviewSessionListItem['status']) {
  return Array.from({ length: count }, (_, index) => session(from + index, status));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSessionList — phân trang', () => {
  it('nạp trang đầu và chỉ báo hasMore khi server trả đủ PAGE_SIZE', async () => {
    listInterviews.mockResolvedValueOnce(page(0, PAGE_SIZE));

    const { result } = renderHook(() => useSessionList(null));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions).toHaveLength(PAGE_SIZE);
    expect(result.current.hasMore).toBe(true);
    expect(listInterviews).toHaveBeenCalledWith({ limit: PAGE_SIZE, offset: 0 });
  });

  it('tải tiếp từ đúng số hàng đang có và dừng khi trang mới không đủ', async () => {
    listInterviews
      .mockResolvedValueOnce(page(0, PAGE_SIZE))
      .mockResolvedValueOnce(page(PAGE_SIZE, 3));
    const { result } = renderHook(() => useSessionList(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(listInterviews).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, offset: PAGE_SIZE });
    expect(result.current.sessions).toHaveLength(PAGE_SIZE + 3);
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useSessionList — reload sau abandon (#397)', () => {
  it('giữ các trang đã mở trên màn hình và nạp lại đủ từng trang', async () => {
    const firstPage = page(0, PAGE_SIZE);
    // 23 là biên quan trọng: `ceil(23 / 20) = 2`. Đổi `ceil` thành `floor` sẽ chỉ reload
    // offset 0, làm mất ba hàng cuối mà `hasMore` vẫn có thể trông hợp lý.
    const secondPage = page(PAGE_SIZE, 3, 'paused');
    listInterviews.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const { result } = renderHook(() => useSessionList(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.sessions).toHaveLength(PAGE_SIZE + 3));

    const refreshedFirstPage = page(0, PAGE_SIZE);
    const refreshedSecondPage = secondPage.map((item, index) =>
      index === 2 ? { ...item, status: 'abandoned' as const } : item
    );
    const pageZero = deferred<InterviewSessionListItem[]>();
    const pageTwenty = deferred<InterviewSessionListItem[]>();
    listInterviews
      .mockImplementationOnce(() => pageZero.promise)
      .mockImplementationOnce(() => pageTwenty.promise);

    act(() => result.current.reload());

    // Bất biến UX: phiên ở trang 2 vẫn tồn tại suốt lúc reload, nên HistoryPage không thể
    // rơi selection về phần tử đầu trang 1.
    expect(result.current.loading).toBe(false);
    expect(result.current.loadingMore).toBe(true);
    expect(result.current.sessions[PAGE_SIZE + 2]?.id).toBe(`session-${PAGE_SIZE + 2}`);

    await waitFor(() => expect(listInterviews).toHaveBeenCalledTimes(4));
    expect(listInterviews).toHaveBeenNthCalledWith(3, { limit: PAGE_SIZE, offset: 0 });
    expect(listInterviews).toHaveBeenNthCalledWith(4, { limit: PAGE_SIZE, offset: PAGE_SIZE });

    await act(async () => {
      pageZero.resolve(refreshedFirstPage);
      pageTwenty.resolve(refreshedSecondPage);
    });

    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.sessions).toHaveLength(PAGE_SIZE + 3);
    // Trang CUỐI ngắn mới quyết định hasMore — không phải trang đầu đầy.
    expect(result.current.hasMore).toBe(false);
    expect(result.current.sessions[PAGE_SIZE + 2]?.status).toBe('abandoned');
  });

  it('một trang reload hỏng thì giữ nguyên toàn bộ dữ liệu cũ, không nhận nửa kết quả', async () => {
    const firstPage = page(0, PAGE_SIZE);
    const secondPage = page(PAGE_SIZE, PAGE_SIZE);
    listInterviews.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);
    const { result } = renderHook(() => useSessionList(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.sessions).toHaveLength(PAGE_SIZE * 2));

    const firstReloadPage = deferred<InterviewSessionListItem[]>();
    const failedReloadPage = deferred<InterviewSessionListItem[]>();
    listInterviews
      .mockImplementationOnce(() => firstReloadPage.promise)
      .mockImplementationOnce(() => failedReloadPage.promise);

    act(() => result.current.reload());

    await waitFor(() => expect(listInterviews).toHaveBeenCalledTimes(4));
    await act(async () => failedReloadPage.reject(new Error('network down')));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.sessions.map((item) => item.id)).toEqual(
      [...firstPage, ...secondPage].map((item) => item.id)
    );

    // Trang tốt về SAU lỗi vẫn không được ghi từng phần vào danh sách cũ.
    await act(async () => firstReloadPage.resolve(page(0, PAGE_SIZE)));
    expect(result.current.error).toBe(true);
    expect(result.current.sessions).toHaveLength(PAGE_SIZE * 2);
  });

  it('trang tải thêm thuộc attempt cũ không được append sau khi reload đã xong', async () => {
    listInterviews.mockResolvedValueOnce(page(0, PAGE_SIZE));
    const { result } = renderHook(() => useSessionList(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const staleLoadMore = deferred<InterviewSessionListItem[]>();
    listInterviews.mockImplementationOnce(() => staleLoadMore.promise);
    act(() => result.current.loadMore());

    const refreshed = deferred<InterviewSessionListItem[]>();
    listInterviews.mockImplementationOnce(() => refreshed.promise);
    act(() => result.current.reload());

    await act(async () => refreshed.resolve(page(0, PAGE_SIZE)));
    expect(result.current.sessions).toHaveLength(PAGE_SIZE);

    await act(async () => staleLoadMore.resolve(page(PAGE_SIZE, PAGE_SIZE)));
    expect(result.current.sessions).toHaveLength(PAGE_SIZE);
  });

  it('không bắt đầu tải thêm khi reload đang nạp lại các trang đã mở', async () => {
    listInterviews.mockResolvedValueOnce(page(0, PAGE_SIZE));
    const { result } = renderHook(() => useSessionList(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const refreshed = deferred<InterviewSessionListItem[]>();
    listInterviews.mockImplementationOnce(() => refreshed.promise);
    act(() => result.current.reload());
    await waitFor(() => expect(listInterviews).toHaveBeenCalledTimes(2));

    act(() => result.current.loadMore());
    expect(listInterviews).toHaveBeenCalledTimes(2);

    await act(async () => refreshed.resolve(page(0, PAGE_SIZE)));
  });
});

describe('useSessionList — đổi bộ lọc', () => {
  it('bỏ phản hồi trễ của bộ lọc cũ và chỉ hiện dữ liệu bộ lọc mới nhất', async () => {
    listInterviews.mockResolvedValueOnce([session(1)]);
    const { result, rerender } = renderHook(
      ({ planId }: { planId: string | null }) => useSessionList(planId),
      { initialProps: { planId: 'plan-a' } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const stale = deferred<InterviewSessionListItem[]>();
    listInterviews
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce([{ ...session(3), plan: { id: 'plan-c', name: 'Kế hoạch C' } }]);

    rerender({ planId: 'plan-b' });
    expect(result.current.sessions).toEqual([]);
    rerender({ planId: 'plan-c' });
    await waitFor(() => expect(result.current.sessions[0]?.plan.id).toBe('plan-c'));

    await act(async () => stale.resolve([{ ...session(2), plan: { id: 'plan-b', name: 'B' } }]));
    expect(result.current.sessions[0]?.plan.id).toBe('plan-c');
  });
});
