import type { ReviewQueueItem } from '@/features/review-queue/types/review-queue.types';

/**
 * Mirror của `items[]` trong `GET /api/v1/review-queue/schedule` (#400 / #402).
 *
 * Là `ReviewQueueItem` + đúng hai trường. Cố ý mở rộng chứ không khai lại: màn Lịch vẽ mỗi mục
 * bằng đúng component dòng của hàng đợi ôn (`ReviewQueueItemRow`), nên hai shape mà trôi khỏi
 * nhau là hỏng ngay chỗ dùng lại đó.
 */
export type ScheduleItem = ReviewQueueItem & {
  /**
   * SIẾT lại `string | null` của `ReviewQueueItem`: `null` ở đó là dành cho gợi ý ảo A3, mà mục
   * ảo không có `scheduledFor` nên không bao giờ đặt lên lịch được — endpoint này không trả mục
   * nào như vậy. Siết ở đây để #403 và #405 khỏi phải `item.id!` ở mọi chỗ dùng.
   */
  id: string;
  /** Instant engine đã chốt (cột `ReviewQueueItem.scheduledFor` trong DB) — đến giờ mới ra khỏi
   *  server; `ReviewQueueItem` phía client chưa từng mang nó. */
  scheduledFor: string;
  /**
   * Ngày lịch VN của `scheduledFor`, do SERVER cắt (`toVnDateKey`). Client không tự suy: cả cây
   * `src/client` không có một chỗ nào biết `Asia/Ho_Chi_Minh`, tự cắt ở đây là đẻ quy ước ngày
   * thứ tư trong repo.
   */
  dateKey: string;
};

/** Mirror của `data` trong `GET /api/v1/review-queue/schedule`. */
export interface ScheduleResponse {
  /**
   * Hôm nay theo giờ VN, do server chốt. Quá hạn suy ở client bằng `dateKey < todayDateKey` (so
   * chuỗi ISO là so ngày) — KHÔNG có cờ `isOverdue` trong hợp đồng, vì một cờ tính sẵn sẽ sai
   * khi tab mở qua nửa đêm, còn `todayDateKey` thì refetch là đúng lại.
   */
  todayDateKey: string;
  /**
   * Đã sắp sẵn: `dateKey` tăng dần, trong cùng ngày theo `sortReviewItems` (truy ngược trước,
   * rồi `priority` giảm dần). Nhóm theo ngày mà GIỮ NGUYÊN thứ tự mảng là có đúng thứ tự trong
   * ngày — đừng cài lại luật hai tầng ở client.
   */
  items: ScheduleItem[];
}

/** Một ngày đã nhóm sẵn — đơn vị `MonthGrid` vẽ. Lưới KHÔNG tự nhóm. */
export interface ScheduleDay {
  dateKey: string;
  items: ScheduleItem[];
  totalMinutes: number;
  /** `dateKey < todayDateKey`. Suy ở đây một lần, không rải phép so sánh khắp component. */
  isOverdue: boolean;
}
