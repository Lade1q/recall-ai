import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getReviewQueueErrorMessage,
  reviewQueueApi,
} from '@/features/review-queue/api/review-queue.api';
import { scheduleApi } from '../api/schedule.api';
import type { ScheduleItem, ScheduleResponse } from '../types/schedule.types';
import { formatDayLabel } from '../utils/schedule-date';

export interface UseScheduleReturn {
  /**
   * Hôm nay theo giờ VN, do server chốt. `null` khi chưa tải xong — **không** thay bằng một ngày
   * client tự cắt: cả cây `src/client` không có chỗ nào biết `Asia/Ho_Chi_Minh`, và một giá trị
   * tạm sai sẽ chốt cứng con trỏ tháng (xem `ScheduleView`).
   */
  todayDateKey: string | null;
  /**
   * Mảng phẳng, đã sắp sẵn từ server (`dateKey` tăng, trong ngày theo `sortReviewItems`).
   * Bộ lọc kế hoạch (#405) chạy trên chính mảng này.
   *
   * `readonly` để không ai `.sort()` tại chỗ rồi phá thứ tự hai tầng mà server vừa cam kết.
   */
  items: readonly ScheduleItem[];
  /** Bật cho lần tải đầu tiên VÀ cho mỗi lần `reload()` — nếu không, bấm "Thử lại" xong màn
   *  đứng yên ở trạng thái lỗi cho tới khi response về, không phản hồi gì. */
  isLoading: boolean;
  /** Chỉ bật khi lần tải đầu tiên thất bại, tức không có gì để hiện. */
  hasError: boolean;
  reload: () => Promise<void>;
  /**
   * `id` các mục đang có một PATCH chạy — nút của đúng mục đó khoá lại trong lúc chờ.
   *
   * Khoá theo `id` chứ không theo `conceptId` như `useReviewQueue`: `GET /schedule` đã fold mỗi
   * cụm `(planId, conceptId)` về ĐÚNG MỘT mục đại diện, nên trên màn này một khái niệm không bao
   * giờ có hai dòng để mà khoá nhầm nhau.
   */
  pendingItemIds: ReadonlySet<string>;
  /** "Dời sang ngày…" — ghi cho cả cụm hàng của khái niệm (#403). */
  reschedule: (item: ScheduleItem, dateKey: string) => void;
  /** "Gỡ khỏi lịch" — `PATCH {status:'skipped'}`, cùng chiều mà #224 mở ra. */
  removeFromSchedule: (item: ScheduleItem) => void;
}

const EMPTY_ITEMS: readonly ScheduleItem[] = [];

/**
 * Nguồn dữ liệu **và** đường ghi của màn Lịch ôn tập (#402 đọc, #403 ghi).
 *
 * CỐ Ý không trả `days` đã nhóm sẵn: nhóm phải chạy SAU khi lọc `hiddenPlanIds`, mà bộ lọc đó là
 * state của màn. Một `days` nhóm trên mảng thô ở đây sẽ là cái tên hiển nhiên nhất để cắm vào
 * lưới, và bộ lọc kế hoạch im lặng mất tác dụng — không lỗi biên dịch, không test nào bắt.
 *
 * Hai hàm ghi nằm ở đây chứ không ở component vì chúng phải sửa **chính mảng này** để cập nhật
 * lạc quan; đặt chúng bên ngoài thì hoặc phải xuất `setState` ra (mở đường cho mọi kiểu sửa), hoặc
 * phải chờ tròn một vòng mạng mới thấy mục nhúc nhích.
 *
 * Không dùng React Query/Zustand — theo convention hiện tại của repo (`useReviewQueue`,
 * `PlansPage`): `useState` + promise chain INLINE trong `useEffect`, tránh lint
 * `react-hooks/set-state-in-effect`.
 */
export function useSchedule(): UseScheduleReturn {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [hasError, setHasError] = useState(false);
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let isMounted = true;
    scheduleApi
      .getSchedule()
      .then((schedule) => {
        if (!isMounted) return;
        setData(schedule);
        setHasError(false);
      })
      .catch((error: unknown) => {
        console.error('Failed to load review schedule', error);
        if (isMounted) setHasError(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // `useCallback` vì #405 sẽ đưa `reload` vào deps của effect/callback — một identity mới mỗi
  // render ở đó là một vòng lặp. Hôm nay vô hại, và đó chính là lúc rẻ nhất để đóng.
  const reload = useCallback(async (): Promise<void> => {
    // Về lại trạng thái đang-tải: đây là điều kiện để nút "Thử lại" có phản hồi thấy được.
    setData(null);
    setHasError(false);
    try {
      setData(await scheduleApi.getSchedule());
    } catch (error) {
      console.error('Failed to reload review schedule', error);
      setHasError(true);
      throw error;
    }
  }, []);

  /**
   * Tải lại **không** xoá dữ liệu đang hiện — khác hẳn `reload()`.
   *
   * Dùng sau mỗi lần ghi: `reload()` chớp cả màn về spinner rồi vẽ lại, làm mất luôn panel đang
   * mở và ô ngày đang chọn. Ở đây thứ vừa đổi chỉ là một mục, và bản lạc quan đã vẽ đúng chỗ rồi;
   * refetch chỉ để lấy lại thứ tự hai tầng của server và ngày CHÍNH XÁC của cả cụm.
   */
  const refreshQuietly = useCallback((): void => {
    scheduleApi
      .getSchedule()
      .then((schedule) => setData(schedule))
      .catch((error: unknown) => {
        console.error('Failed to refresh review schedule after a write', error);
        toast.error('Đã lưu thay đổi, nhưng chưa tải lại được lịch mới nhất.');
      });
  }, []);

  const setPending = useCallback((itemId: string, isPending: boolean): void => {
    setPendingItemIds((prev) => {
      const next = new Set(prev);
      if (isPending) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  /** Thay mảng `items` bằng kết quả của `update`, giữ nguyên `todayDateKey`. */
  const patchItems = useCallback((update: (items: ScheduleItem[]) => ScheduleItem[]): void => {
    setData((prev) => (prev ? { ...prev, items: update(prev.items) } : prev));
  }, []);

  const reschedule = useCallback(
    (item: ScheduleItem, dateKey: string): void => {
      if (pendingItemIds.has(item.id) || dateKey === item.dateKey) return;
      setPending(item.id, true);

      // Lạc quan: chỉ đổi `dateKey`, KHÔNG dựng một `scheduledFor` mới. Instant thật là 00:00 giờ
      // VN của ngày đó, mà client không có quyền tự quy đổi (xem `ScheduleItem.dateKey`) — và cả
      // màn này chỉ đọc `dateKey`. Refetch ngay dưới đây trả lại cặp giá trị nhất quán.
      patchItems((items) =>
        items.map((candidate) => (candidate.id === item.id ? { ...candidate, dateKey } : candidate))
      );

      void (async () => {
        try {
          await reviewQueueApi.rescheduleReviewQueueItem(item.id, dateKey);
          toast.success(`Đã dời "${item.name}" sang ${formatDayLabel(dateKey)}.`);
          refreshQuietly();
        } catch (error) {
          console.error('Failed to reschedule review queue item', error);
          patchItems((items) =>
            items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, dateKey: item.dateKey } : candidate
            )
          );
          toast.error(getReviewQueueErrorMessage(error, 'reschedule'));
        } finally {
          setPending(item.id, false);
        }
      })();
    },
    [patchItems, pendingItemIds, refreshQuietly, setPending]
  );

  const removeFromSchedule = useCallback(
    (item: ScheduleItem): void => {
      if (pendingItemIds.has(item.id)) return;
      setPending(item.id, true);

      // Ghi lại CHỖ ĐỨNG, không chỉ mục bị gỡ: thứ tự trong một ngày là thứ tự hai tầng của server
      // (truy ngược trước, rồi `priority`), nên rollback bằng cách nối vào cuối mảng sẽ trả mục về
      // đúng ngày nhưng sai vị trí — một thay đổi không ai yêu cầu, sau một thao tác đã thất bại.
      const removedIndex = (data?.items ?? EMPTY_ITEMS).findIndex(
        (candidate) => candidate.id === item.id
      );
      patchItems((items) => items.filter((candidate) => candidate.id !== item.id));

      void (async () => {
        try {
          await reviewQueueApi.updateReviewQueueItem(item.id, 'skipped');
          // Không có cửa sổ "Hoàn tác" như màn Hàng đợi ôn (#225): ở đó dòng vừa gỡ còn nằm nguyên
          // chỗ cũ để bấm hoàn tác, còn ở đây mục biến khỏi một ô lưới có thể đang ở tháng khác.
          // Lối quay lại là nhóm "Đã gỡ khỏi lịch" của chính kế hoạch đó, nên câu này chỉ đường.
          toast.success(`Đã gỡ "${item.name}" khỏi lịch. Đưa lại được ở hàng đợi ôn của kế hoạch.`);
          refreshQuietly();
        } catch (error) {
          console.error('Failed to remove review queue item from the schedule', error);
          patchItems((items) => {
            const next = [...items];
            next.splice(
              removedIndex < 0 ? next.length : Math.min(removedIndex, next.length),
              0,
              item
            );
            return next;
          });
          toast.error(getReviewQueueErrorMessage(error, 'remove'));
        } finally {
          setPending(item.id, false);
        }
      })();
    },
    [data?.items, patchItems, pendingItemIds, refreshQuietly, setPending]
  );

  return {
    todayDateKey: data?.todayDateKey ?? null,
    items: data?.items ?? EMPTY_ITEMS,
    isLoading: data === null && !hasError,
    hasError,
    reload,
    pendingItemIds,
    reschedule,
    removeFromSchedule,
  };
}
