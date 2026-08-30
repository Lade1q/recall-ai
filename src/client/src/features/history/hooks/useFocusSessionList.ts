import { useCallback, useEffect, useState } from 'react';

import { focusSessionApi } from '@/features/focus/api/focus.api';
import type { FocusSessionListItem } from '@/features/focus/types/focus.types';

/** Cùng cỡ trang với tab Phiên kiểm tra (`history.api.ts`) — hai tab cạnh nhau tải thêm bằng
 *  nhịp giống nhau thì người dùng không phải học hai hành vi. */
export const FOCUS_PAGE_SIZE = 20;

export interface FocusSessionList {
  sessions: FocusSessionListItem[];
  /** Đang tải trang ĐẦU (khung còn trống) — khác hẳn `loadingMore`. */
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  /** Trang cuối trả về đủ `FOCUS_PAGE_SIZE` phần tử ⇒ có thể còn nữa. */
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

interface LoadedList {
  /** Khoá của lần thử đã sinh ra dữ liệu này. */
  key: string;
  sessions: FocusSessionListItem[];
  error: boolean;
  hasMore: boolean;
}

/**
 * Lịch sử phiên học, tải theo trang (DB-08 · #247).
 *
 * Dựng theo đúng khuôn `useSessionList` của tab Phiên kiểm tra — cùng hợp đồng, cùng hạn chế —
 * nhưng **không nhận bộ lọc**: `GET /focus-sessions` chỉ có `limit`/`offset`
 * (`listFocusSessionsQuerySchema`), không có `planId`. Đừng thêm tham số lọc ở đây rồi lọc phía
 * client: nó sẽ chỉ lọc trong những trang đã tải, và người dùng không có cách nào biết điều đó.
 *
 * `GET /focus-sessions` **không trả `total`** — y hệt `/interviews`. Hệ quả cố ý: khi tổng số
 * phiên chia hết cho `FOCUS_PAGE_SIZE`, nút "Xem thêm" còn hiện thêm một lần và trang cuối trả
 * về rỗng. Đó là điều tốt nhất hợp đồng cho phép. ⚠️ Cũng vì vậy **không suy ra được tổng số
 * phiên** để in lên nhãn tab như mockup vẽ — xem ghi chú trong PR.
 */
export function useFocusSessionList(): FocusSessionList {
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = `#${attempt}`;

  useEffect(() => {
    let alive = true;
    focusSessionApi
      .list({ limit: FOCUS_PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (alive) {
          setLoaded({
            key,
            sessions: page,
            error: false,
            hasMore: page.length === FOCUS_PAGE_SIZE,
          });
        }
      })
      .catch(() => {
        if (alive) setLoaded({ key, sessions: [], error: true, hasMore: false });
      });
    return () => {
      // Bấm "Thử lại" liên tiếp: phản hồi của lần thử cũ không được ghi đè lần mới.
      alive = false;
    };
  }, [key]);

  const current = loaded !== null && loaded.key === key ? loaded : null;

  const loadMore = useCallback(() => {
    if (loadingMore || current === null) return;
    setLoadingMore(true);

    focusSessionApi
      .list({
        limit: FOCUS_PAGE_SIZE,
        // `offset` tính từ số phiên ĐANG hiển thị, không phải số trang đã bấm — hai cách chỉ
        // khác nhau khi một request lỗi giữa chừng, và cách này không bỏ sót phiên nào.
        offset: current.sessions.length,
      })
      .then((page) => {
        setLoadingMore(false);
        setLoaded((prev) =>
          prev !== null && prev.key === key
            ? {
                ...prev,
                sessions: [...prev.sessions, ...page],
                hasMore: page.length === FOCUS_PAGE_SIZE,
              }
            : prev
        );
      })
      .catch(() => {
        // Tải thêm hỏng thì giữ nguyên những phiên đã có — mất danh sách đang đọc vì một trang
        // phụ lỗi là cái giá quá đắt. Nút vẫn còn đó để bấm lại.
        setLoadingMore(false);
      });
  }, [loadingMore, current, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    sessions: current?.sessions ?? [],
    loading: current === null,
    loadingMore,
    error: current?.error ?? false,
    hasMore: current?.hasMore ?? false,
    loadMore,
    reload,
  };
}
