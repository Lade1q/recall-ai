import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { historyApi, PAGE_SIZE } from '../api/history.api';
import type { InterviewSessionListItem } from '../types/history.types';

export interface SessionList {
  sessions: InterviewSessionListItem[];
  /** Đang tải trang ĐẦU (khung danh sách còn trống) — khác hẳn `loadingMore`. */
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  /** Trang cuối trả về đủ `PAGE_SIZE` phần tử ⇒ có thể còn nữa. Xem ghi chú bên dưới. */
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

interface LoadedList {
  /** Khoá của bộ lọc + lần thử đã sinh ra dữ liệu này. */
  key: string;
  sessions: InterviewSessionListItem[];
  error: boolean;
  hasMore: boolean;
}

/**
 * Danh sách phiên kiểm tra, tải theo trang.
 *
 * `GET /interviews` không trả `total` hay `hasMore`, nên "còn nữa không" chỉ suy được từ số
 * phần tử nhận về. Hệ quả cố ý: khi tổng số phiên chia hết cho `PAGE_SIZE`, nút "Xem thêm" còn
 * hiện thêm một lần và trang cuối trả về rỗng. Đó là điều tốt nhất hợp đồng này cho phép —
 * đoán một con số tổng rồi hiện ra sẽ sai nhiều hơn.
 *
 * `loading` suy ra từ khoá (bộ lọc hiện tại so với khoá của dữ liệu đang giữ), không phải một
 * cờ bật trong thân effect: đổi kế hoạch là danh sách cũ biến mất ngay lượt render đó.
 */
export function useSessionList(planId: string | null): SessionList {
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = `${planId ?? ''}#${attempt}`;

  useEffect(() => {
    let alive = true;
    historyApi
      .listInterviews({ limit: PAGE_SIZE, offset: 0, ...(planId ? { planId } : {}) })
      .then((page) => {
        if (alive) {
          setLoaded({ key, sessions: page, error: false, hasMore: page.length === PAGE_SIZE });
        }
      })
      .catch(() => {
        if (alive) setLoaded({ key, sessions: [], error: true, hasMore: false });
      });
    return () => {
      // Đổi bộ lọc liên tiếp: phản hồi của bộ lọc cũ không được ghi đè bộ lọc mới.
      alive = false;
    };
  }, [key, planId]);

  const current = loaded !== null && loaded.key === key ? loaded : null;

  const loadMore = useCallback(() => {
    if (loadingMore || current === null) return;
    setLoadingMore(true);

    historyApi
      .listInterviews({
        limit: PAGE_SIZE,
        // `offset` tính từ số phiên ĐANG hiển thị, không phải số trang đã bấm — hai cách chỉ
        // khác nhau khi một request lỗi giữa chừng, và cách này không bỏ sót phiên nào.
        offset: current.sessions.length,
        ...(planId ? { planId } : {}),
      })
      .then((page) => {
        setLoadingMore(false);
        setLoaded((prev) =>
          // Bộ lọc đã đổi trong lúc chờ ⇒ trang này thuộc về danh sách không còn hiển thị nữa.
          prev !== null && prev.key === key
            ? {
                ...prev,
                sessions: [...prev.sessions, ...page],
                hasMore: page.length === PAGE_SIZE,
              }
            : prev
        );
      })
      .catch(() => {
        // Tải thêm hỏng thì giữ nguyên những phiên đã có — mất danh sách đang đọc vì một trang
        // phụ lỗi là cái giá quá đắt. Nút vẫn còn đó để bấm lại.
        setLoadingMore(false);

        // Nhưng giữ danh sách KHÔNG có nghĩa là im lặng. Trước #450, nhánh này chỉ tắt cờ quay:
        // người dùng bấm "Xem thêm", nút quay xong, và **không gì xảy ra, không ai nói gì** —
        // không phân biệt được với "hết phiên rồi". Toast ở đây vì trang đầu (`error`) cũng báo
        // bằng toast, cùng quy ước AC #246/#247; khác chỗ nó KHÔNG bật `error`, nên danh sách
        // đang đọc ở lại nguyên vẹn.
        toast.error('Không tải thêm được phiên kiểm tra. Kiểm tra kết nối rồi bấm lại.');
      });
  }, [loadingMore, current, planId, key]);

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
