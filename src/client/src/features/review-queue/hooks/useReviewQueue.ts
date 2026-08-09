import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { reviewQueueApi } from '../api/review-queue.api';
import type {
  ReviewItemStatus,
  ReviewQueueItem,
  ReviewQueueListResponse,
} from '../types/review-queue.types';

/**
 * Mockup §4 ("Vừa gỡ"): dòng xác nhận + "Hoàn tác" sống 6 giây tại đúng chỗ cũ của mục.
 *
 * Đây là cửa sổ của GIAO DIỆN, không phải cửa sổ của việc ghi: PATCH `skipped` đã bắn ngay lúc
 * bấm. Hoãn ghi 6 giây thì rời trang giữa chừng là mất trắng thao tác, trái DoD #225 ("Gỡ một
 * khái niệm → reload trang → vẫn đang bị gỡ") và trái ràng buộc "không giữ state chỉ trong React".
 * Hoàn tác vì thế là một PATCH `pending` thật, đúng hai chiều mà #224 mở ra.
 */
const UNDO_WINDOW_MS = 6000;

interface QueueState {
  items: ReviewQueueItem[];
  skippedItems: ReviewQueueItem[];
  message: string | null;
  totalEstimatedMinutes: number;
}

function toQueueState(response: ReviewQueueListResponse): QueueState {
  return {
    items: response.items,
    // Vắng mặt (không truyền includeSkipped) -> coi như rỗng cho state hiển thị; hai sự thật đó
    // chỉ khác nhau ở tầng response thô, không phải ở tầng UI.
    skippedItems: response.skippedItems ?? [],
    message: response.message,
    totalEstimatedMinutes: response.totalEstimatedMinutes,
  };
}

/** Chuyển một khái niệm từ `items` sang `skippedItems` ngay trên state đang có — dùng khi cửa sổ
 *  Hoàn tác đóng lại, để danh sách không phụ thuộc vào việc tải lại có thành công hay không. */
function withConceptSkipped(prev: QueueState, conceptId: string): QueueState {
  const item = prev.items.find((i) => i.conceptId === conceptId);
  if (item === undefined) return prev;
  return {
    ...prev,
    items: prev.items.filter((i) => i.conceptId !== conceptId),
    skippedItems: [...prev.skippedItems, { ...item, status: 'skipped' }],
  };
}

export interface UseReviewQueueReturn {
  items: ReviewQueueItem[];
  skippedItems: ReviewQueueItem[];
  message: string | null;
  totalEstimatedMinutes: number;
  /** Chỉ true cho lần tải đầu tiên — tránh tách biến `isLoading` rời khỏi state (set-state-in-effect). */
  isLoading: boolean;
  /** Chỉ bật khi lần tải ĐẦU TIÊN thất bại (không có gì để hiện). Lỗi tải lại sau một PATCH không
   *  bật cờ này — nó đã có toast riêng, và dữ liệu cũ vẫn còn dùng được. */
  hasError: boolean;
  /** conceptId đang có PATCH chạy — dùng để khoá nút trong lúc chờ phản hồi server. */
  pendingConceptIds: Set<string>;
  /** conceptId đang hiện dòng "Vừa gỡ". Server ĐÃ ghi `skipped` rồi; đây chỉ là cửa sổ 6 giây để
   *  bấm Hoàn tác, nên mọi chỗ đọc nó phải coi mục đó là ĐÃ gỡ, không phải "đang chờ gỡ". */
  goneConceptIds: Set<string>;
  remove: (item: ReviewQueueItem) => void;
  undoRemove: (item: ReviewQueueItem) => void;
  restore: (item: ReviewQueueItem) => void;
  reload: () => Promise<void>;
}

/**
 * Nguồn dữ liệu + hành vi sửa của SP-07/SP-08 (Hàng đợi ôn của một plan — Issue #225).
 *
 * Không dùng React Query/Zustand — theo đúng convention hiện tại của repo (`PlansPage.tsx`,
 * `useFocusTimer.ts`): state cây thuần bằng `useState`, tải lần đầu bằng promise chain INLINE
 * trong `useEffect` (không qua một hàm `useCallback` có setState bên trong) để tránh lint
 * `react-hooks/set-state-in-effect`.
 */
export function useReviewQueue(planId: string): UseReviewQueueReturn {
  const [state, setState] = useState<QueueState | null>(null);
  const [hasError, setHasError] = useState(false);
  const [pendingConceptIds, setPendingConceptIds] = useState<Set<string>>(() => new Set());
  const [goneConceptIds, setGoneConceptIds] = useState<Set<string>>(() => new Set());

  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let isMounted = true;
    reviewQueueApi
      .getReviewQueue(planId, { includeSkipped: true })
      .then((data) => {
        if (!isMounted) return;
        setState(toQueueState(data));
        setHasError(false);
      })
      .catch((error: unknown) => {
        console.error('Failed to load review queue', error);
        if (isMounted) setHasError(true);
      });
    return () => {
      isMounted = false;
    };
  }, [planId]);

  // Dọn timer treo khi rời trang giữa cửa sổ Hoàn tác. Không có gì bị mất: PATCH đã gửi xong từ
  // lúc bấm, thứ bị huỷ chỉ là việc dọn dòng "Vừa gỡ" trên một cây DOM sắp biến mất.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, []);

  /** Tải lại danh sách từ server để lấy đúng thứ tự hai tầng — không tự sort ở client. Ném lỗi
   *  tiếp để nơi gọi (mutation, nút "Thử lại") tự quyết định cách báo. */
  const reload = async (): Promise<void> => {
    const data = await reviewQueueApi.getReviewQueue(planId, { includeSkipped: true });
    setState(toQueueState(data));
    setHasError(false);
  };

  const setPending = (conceptId: string, isPending: boolean): void => {
    setPendingConceptIds((prev) => {
      const next = new Set(prev);
      if (isPending) next.add(conceptId);
      else next.delete(conceptId);
      return next;
    });
  };

  const setGone = (conceptId: string, isGone: boolean): void => {
    setGoneConceptIds((prev) => {
      const next = new Set(prev);
      if (isGone) next.add(conceptId);
      else next.delete(conceptId);
      return next;
    });
  };

  /** Gửi một chiều PATCH và khoá nút của khái niệm đó trong lúc chờ. Trả về việc server có nhận
   *  hay không, để nơi gọi tự quyết định rollback — không nuốt lỗi. */
  const patchStatus = async (
    item: ReviewQueueItem & { id: string },
    status: ReviewItemStatus
  ): Promise<boolean> => {
    setPending(item.conceptId, true);
    try {
      await reviewQueueApi.updateReviewQueueItem(item.id, status);
      return true;
    } catch (error) {
      console.error('Failed to update review queue item', error);
      return false;
    } finally {
      setPending(item.conceptId, false);
    }
  };

  /** Tải lại sau khi PATCH đã thành công. Không rollback ở đây: thay đổi đã nằm trên server rồi,
   *  thứ có thể lệch chỉ là thứ tự hiển thị. */
  const reloadAfterWrite = (): void => {
    reload().catch((error: unknown) => {
      console.error('Failed to reload review queue after update', error);
      toast.error('Đã lưu thay đổi, nhưng chưa tải lại được danh sách mới nhất.');
    });
  };

  /** Hết 6 giây mà không ai bấm Hoàn tác: dọn dòng "Vừa gỡ", đưa mục xuống nhóm "Đã gỡ khỏi lịch".
   *  Không có PATCH nào ở bước này — nó đã chạy từ lúc bấm. */
  const closeUndoWindow = (conceptId: string): void => {
    timeoutsRef.current.delete(conceptId);
    setGone(conceptId, false);
    setState((prev) => (prev ? withConceptSkipped(prev, conceptId) : prev));
    reloadAfterWrite();
  };

  /** "Bỏ khỏi lịch" — PATCH `skipped` NGAY, rồi mở cửa sổ Hoàn tác 6 giây trên giao diện. Reload
   *  hay rời trang giữa cửa sổ đó đều giữ nguyên kết quả, vì server đã ghi xong. */
  const remove = (item: ReviewQueueItem): void => {
    if (item.id === null) return; // Mục ảo A3 — không có hàng thật để gỡ.
    const conceptId = item.conceptId;
    if (goneConceptIds.has(conceptId) || pendingConceptIds.has(conceptId)) return;
    const realItem = { ...item, id: item.id };

    setGone(conceptId, true);

    void (async () => {
      const ok = await patchStatus(realItem, 'skipped');
      if (!ok) {
        setGone(conceptId, false);
        toast.error('Không gỡ được khỏi lịch. Vui lòng thử lại.');
        return;
      }
      const timeoutId = setTimeout(() => closeUndoWindow(conceptId), UNDO_WINDOW_MS);
      timeoutsRef.current.set(conceptId, timeoutId);
    })();
  };

  /** "Hoàn tác" trong vòng 6 giây — PATCH `pending` để đảo lại việc ghi lúc gỡ. Hết cửa sổ thì nút
   *  này không còn trên màn nữa; mục vẫn đưa lại được từ nhóm "Đã gỡ khỏi lịch". */
  const undoRemove = (item: ReviewQueueItem): void => {
    const conceptId = item.conceptId;
    const timeoutId = timeoutsRef.current.get(conceptId);
    if (timeoutId === undefined) return;
    if (item.id === null) return;
    clearTimeout(timeoutId);
    timeoutsRef.current.delete(conceptId);
    const realItem = { ...item, id: item.id };

    void (async () => {
      const ok = await patchStatus(realItem, 'pending');
      setGone(conceptId, false);
      if (!ok) {
        // Hoàn tác trượt thì sự thật vẫn là "đã gỡ" — đưa mục xuống nhóm đã gỡ thay vì để nó nằm
        // lại hàng đợi như chưa có gì xảy ra.
        toast.error('Không hoàn tác được. Khái niệm vẫn đang bị gỡ khỏi lịch.');
        setState((prev) => (prev ? withConceptSkipped(prev, conceptId) : prev));
        return;
      }
      reloadAfterWrite();
    })();
  };

  /** "Đưa lại vào lịch" — không có cửa sổ tạm, PATCH ngay (optimistic + rollback khi lỗi). */
  const restore = (item: ReviewQueueItem): void => {
    if (item.id === null || pendingConceptIds.has(item.conceptId)) return;
    const conceptId = item.conceptId;
    const realItem = { ...item, id: item.id };

    setState((prev) =>
      prev
        ? {
            ...prev,
            skippedItems: prev.skippedItems.filter((i) => i.conceptId !== conceptId),
            items: [...prev.items, { ...item, status: 'pending' }],
          }
        : prev
    );

    void (async () => {
      const ok = await patchStatus(realItem, 'pending');
      if (!ok) {
        setState((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((i) => i.conceptId !== conceptId),
                skippedItems: [...prev.skippedItems, item],
              }
            : prev
        );
        toast.error('Không đưa lại vào lịch được. Vui lòng thử lại.');
        return;
      }
      reloadAfterWrite();
    })();
  };

  return {
    items: state?.items ?? [],
    skippedItems: state?.skippedItems ?? [],
    message: state?.message ?? null,
    totalEstimatedMinutes: state?.totalEstimatedMinutes ?? 0,
    isLoading: state === null && !hasError,
    hasError,
    pendingConceptIds,
    goneConceptIds,
    remove,
    undoRemove,
    restore,
    reload,
  };
}
