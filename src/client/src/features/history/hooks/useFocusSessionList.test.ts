import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { focusSessionApi } from '@/features/focus/api/focus.api';
import type { FocusSessionListItem } from '@/features/focus/types/focus.types';
import { FOCUS_PAGE_SIZE, useFocusSessionList } from './useFocusSessionList';

vi.mock('@/features/focus/api/focus.api', () => ({
  focusSessionApi: { list: vi.fn() },
}));

const list = vi.mocked(focusSessionApi.list);

function session(id: string): FocusSessionListItem {
  return {
    id,
    planId: 'plan-1',
    concepts: [{ id: 'c-1', name: 'Ngăn xếp' }],
    status: 'completed',
    durationMinutes: 25,
    focusedSeconds: 1500,
    awayCount: 0,
    pomodorosCompleted: 1,
    strictMode: false,
    startedAt: new Date(2026, 7, 30, 19, 5).toISOString(),
    endedAt: new Date(2026, 7, 30, 19, 30).toISOString(),
  };
}

/** Một trang ĐẦY — `hasMore` chỉ suy được từ `page.length === FOCUS_PAGE_SIZE`. */
function fullPage(prefix: string): FocusSessionListItem[] {
  return Array.from({ length: FOCUS_PAGE_SIZE }, (_, i) => session(`${prefix}-${i}`));
}

/** Một promise treo hẳn + cách gỡ nó ra, để đo được trạng thái GIỮA CHỪNG. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  list.mockReset();
});

describe('useFocusSessionList — tải trang đầu', () => {
  it('trả về danh sách và tắt loading khi trang đầu về', async () => {
    list.mockResolvedValue([session('a')]);
    const { result } = renderHook(() => useFocusSessionList());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions.map((s) => s.id)).toEqual(['a']);
    expect(result.current.error).toBe(false);
  });

  it('loading là TRUE khi request còn treo — không phải false rồi rỗng', async () => {
    // Đột biến `loading: current === null` → `false` khiến khung rỗng "Chưa có phiên học nào"
    // loé lên trong lúc đang tải. Đây là ca ghim nó: promise treo, chưa có dữ liệu.
    const d = deferred<FocusSessionListItem[]>();
    list.mockReturnValue(d.promise);

    const { result } = renderHook(() => useFocusSessionList());

    expect(result.current.loading).toBe(true);
    expect(result.current.sessions).toEqual([]);

    await act(async () => {
      d.resolve([session('a')]);
    });
    expect(result.current.loading).toBe(false);
  });

  it('trang đầu lỗi ⇒ error, không loading, danh sách rỗng', async () => {
    list.mockRejectedValue(new Error('mạng hỏng'));
    const { result } = renderHook(() => useFocusSessionList());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('hasMore chỉ bật khi trang trả về ĐỦ FOCUS_PAGE_SIZE phần tử', async () => {
    list.mockResolvedValue([session('a')]);
    const short = renderHook(() => useFocusSessionList());
    await waitFor(() => expect(short.result.current.loading).toBe(false));
    expect(short.result.current.hasMore).toBe(false);

    list.mockResolvedValue(fullPage('p1'));
    const full = renderHook(() => useFocusSessionList());
    await waitFor(() => expect(full.result.current.loading).toBe(false));
    expect(full.result.current.hasMore).toBe(true);
  });
});

describe('useFocusSessionList — "Xem thêm"', () => {
  async function loadedWithFullFirstPage() {
    list.mockResolvedValue(fullPage('p1'));
    const hook = renderHook(() => useFocusSessionList());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  it('NỐI trang sau vào danh sách, không THAY THẾ', async () => {
    // Đột biến `sessions: [...prev.sessions, ...page]` → `page` làm mất sạch phần đang đọc.
    const { result } = await loadedWithFullFirstPage();
    expect(result.current.sessions).toHaveLength(FOCUS_PAGE_SIZE);

    list.mockResolvedValue([session('p2-0')]);
    await act(async () => {
      result.current.loadMore();
    });

    expect(result.current.sessions).toHaveLength(FOCUS_PAGE_SIZE + 1);
    expect(result.current.sessions[0].id).toBe('p1-0');
    expect(result.current.sessions[result.current.sessions.length - 1].id).toBe('p2-0');
  });

  it('xin offset bằng số phiên ĐANG hiển thị, không phải 0', async () => {
    // Đột biến `offset: current.sessions.length` → `0` tải lại trang 1 ⇒ nhân đôi mọi hàng và
    // trùng `key` React.
    const { result } = await loadedWithFullFirstPage();
    list.mockResolvedValue([session('p2-0')]);

    await act(async () => {
      result.current.loadMore();
    });

    expect(list).toHaveBeenLastCalledWith({ limit: FOCUS_PAGE_SIZE, offset: FOCUS_PAGE_SIZE });
  });

  it('đang tải thêm thì lượt gọi tiếp theo bị chặn — chỉ MỘT request bay', async () => {
    // Đột biến: bỏ guard `loadingMore`.
    //
    // ⚠️ Guard này là một CỜ STATE, nên nó chặn lượt gọi ở render SAU, không chặn hai lời gọi
    // trong CÙNG một tick — React gộp `setLoadingMore(true)` nên `result.current` của tick đó
    // vẫn thấy `loadingMore === false`. Đó là giới hạn thật của cách cài, không phải của test:
    // ca cùng-tick không tới được từ UI (`loadMore` chỉ có một người gọi là nút "Xem thêm", và
    // hai cú bấm là hai sự kiện có một lượt render ở giữa). Test ghim đúng thứ guard bảo đảm.
    const { result } = await loadedWithFullFirstPage();
    const callsAfterFirstPage = list.mock.calls.length;

    const d = deferred<FocusSessionListItem[]>();
    list.mockReturnValue(d.promise);

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.loadingMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });
    expect(list.mock.calls.length - callsAfterFirstPage).toBe(1);

    await act(async () => {
      d.resolve([session('p2-0')]);
    });
    expect(result.current.loadingMore).toBe(false);
  });

  it('trang phụ lỗi thì GIỮ nguyên phần đã tải, chỉ tắt loadingMore', async () => {
    const { result } = await loadedWithFullFirstPage();
    list.mockRejectedValue(new Error('trang phụ hỏng'));

    await act(async () => {
      result.current.loadMore();
    });

    expect(result.current.sessions).toHaveLength(FOCUS_PAGE_SIZE);
    expect(result.current.loadingMore).toBe(false);
    // Mất danh sách đang đọc vì một trang phụ lỗi là cái giá quá đắt — nút vẫn còn để bấm lại.
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBe(false);
  });
});

describe('useFocusSessionList — reload và các lượt tải chồng nhau', () => {
  it('reload sau khi lỗi tải lại được', async () => {
    list.mockRejectedValueOnce(new Error('hỏng'));
    const { result } = renderHook(() => useFocusSessionList());
    await waitFor(() => expect(result.current.error).toBe(true));

    list.mockResolvedValue([session('a')]);
    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('phản hồi của lần thử CŨ không ghi đè lần thử mới', async () => {
    // Đột biến: bỏ guard `alive` trong effect. Bấm "Thử lại" liên tiếp thì lượt cũ về SAU và
    // đè lên lượt mới.
    const first = deferred<FocusSessionListItem[]>();
    const second = deferred<FocusSessionListItem[]>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useFocusSessionList());
    act(() => {
      result.current.reload();
    });

    // Lượt MỚI về trước, rồi lượt CŨ mới về — thứ tự này là cả nội dung của phép kiểm.
    await act(async () => {
      second.resolve([session('moi')]);
    });
    await act(async () => {
      first.resolve([session('cu')]);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual(['moi']);
  });

  it('trang phụ của lượt CŨ không đổ vào danh sách của lượt mới', async () => {
    // Đột biến: bỏ kiểm `prev.key === key` trong `loadMore`.
    list.mockResolvedValue(fullPage('p1'));
    const { result } = renderHook(() => useFocusSessionList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const stale = deferred<FocusSessionListItem[]>();
    list.mockReturnValueOnce(stale.promise);
    act(() => {
      result.current.loadMore();
    });

    // Reload trong lúc trang phụ còn bay: danh sách mới ngắn hơn nhiều.
    list.mockResolvedValue([session('sau-reload')]);
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    await act(async () => {
      stale.resolve([session('trang-phu-cu')]);
    });

    expect(result.current.sessions.map((s) => s.id)).toEqual(['sau-reload']);
  });
});
