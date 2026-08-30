import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Khoá của bộ lọc đã sinh ra dữ liệu này. */
  key: string;
  /** Lần tải đã sinh ra dữ liệu; dùng để chặn trang cũ ghi đè sau một lần reload. */
  attempt: number;
  sessions: InterviewSessionListItem[];
  error: boolean;
  hasMore: boolean;
}

function pageOffsets(itemCount: number): number[] {
  const pageCount = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  return Array.from({ length: pageCount }, (_, index) => index * PAGE_SIZE);
}

/**
 * Danh sách phiên kiểm tra, tải theo trang.
 *
 * `GET /interviews` không trả `total` hay `hasMore`, nên "còn nữa không" chỉ suy được từ số
 * phần tử nhận về. Hệ quả cố ý: khi tổng số phiên chia hết cho `PAGE_SIZE`, nút "Xem thêm" còn
 * hiện thêm một lần và trang cuối trả về rỗng. Đó là điều tốt nhất hợp đồng này cho phép —
 * đoán một con số tổng rồi hiện ra sẽ sai nhiều hơn.
 *
 * `loading` suy ra từ khoá bộ lọc, không phải một cờ bật trong thân effect: đổi kế hoạch là
 * danh sách cũ biến mất ngay lượt render đó. Riêng `reload` giữ nguyên dữ liệu của cùng bộ lọc
 * trong lúc nạp và gọi lại đủ số trang đã mở. Nếu xoá dữ liệu ngay khi reload thì abandon một
 * phiên ở trang sau sẽ làm selection rơi về phiên mới nhất ở trang 1 (#397).
 */
export function useSessionList(planId: string | null): SessionList {
  const [loaded, setLoaded] = useState<LoadedList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadedRef = useRef(loaded);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  const key = planId ?? '';

  useEffect(() => {
    let alive = true;
    const previous = loadedRef.current?.key === key ? loadedRef.current : null;
    const offsets = pageOffsets(previous?.sessions.length ?? 0);

    Promise.all(
      offsets.map((offset) =>
        historyApi.listInterviews({
          limit: PAGE_SIZE,
          offset,
          ...(planId ? { planId } : {}),
        })
      )
    )
      .then((pages) => {
        if (alive) {
          const lastPage = pages[pages.length - 1] ?? [];
          setLoaded({
            key,
            attempt,
            sessions: pages.flat(),
            error: false,
            hasMore: lastPage.length === PAGE_SIZE,
          });
        }
      })
      .catch(() => {
        if (alive) {
          // Reload hỏng vẫn giữ các trang người dùng đang đọc. `error` đưa ra lối Thử lại,
          // nhưng dữ liệu không bị vứt đi rồi làm selection âm thầm đổi sang phiên khác.
          setLoaded((current) => ({
            key,
            attempt,
            sessions: current?.key === key ? current.sessions : [],
            error: true,
            hasMore: current?.key === key ? current.hasMore : false,
          }));
        }
      });
    return () => {
      // Đổi bộ lọc/reload liên tiếp: phản hồi cũ không được ghi đè lần đang cần.
      alive = false;
    };
  }, [attempt, key, planId]);

  const current = loaded !== null && loaded.key === key ? loaded : null;
  const reloading = current !== null && current.attempt !== attempt;

  const loadMore = useCallback(() => {
    if (loadingMore || reloading || current === null) return;
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
          prev !== null && prev.key === key && prev.attempt === attempt
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
  }, [loadingMore, reloading, current, planId, key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    sessions: current?.sessions ?? [],
    loading: current === null,
    // Trong lúc reload, vô hiệu hoá "Xem thêm" để một trang thuộc ảnh chụp cũ không chen vào
    // giữa các trang đang được nạp lại. Dùng chung trạng thái spinner vì nút đã có sẵn affordance.
    loadingMore: loadingMore || reloading,
    error: current?.error ?? false,
    hasMore: current?.hasMore ?? false,
    loadMore,
    reload,
  };
}
