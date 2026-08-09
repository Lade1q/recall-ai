export type ReviewReason = 'traceback' | 'spaced_repetition' | 'deadline_priority' | 'manual';

/** Hai chiều duy nhất của `PATCH /review-queue/:itemId` (#224) — hẹp hơn `ReviewQueueItem.status`,
 *  vốn còn giữ `accepted`/`done` cho dữ liệu cũ/tương lai mà client không bao giờ được gửi lên. */
export type ReviewItemStatus = 'pending' | 'skipped';

/** Mirror của `ReviewQueueItemResponse` server (scheduling.service.ts). */
export interface ReviewQueueItem {
  /** `null` cho gợi ý ảo A3-fallback — không có hàng thật để PATCH. */
  id: string | null;
  conceptId: string;
  name: string;
  planId: string;
  planName: string;
  priority: number;
  reason: ReviewReason;
  reasonText: string;
  sourceConceptName: string | null;
  depth: number | null;
  masteryScore: number | null;
  status: 'pending' | 'accepted' | 'skipped' | 'done';
  estimatedMinutes: number;
  sourceSessionEndedAt: string | null;
}

/** Mirror của `ReviewQueueListResponse` server. */
export interface ReviewQueueListResponse {
  items: ReviewQueueItem[];
  message: string | null;
  totalEstimatedMinutes: number;
  /** Nhóm "Đã gỡ khỏi lịch", chỉ có khi request truyền `includeSkipped=true`. VẮNG MẶT hẳn (không
   *  phải `[]`) khi không truyền — "chưa gỡ gì" và "không ai hỏi tới" là hai sự thật khác nhau. */
  skippedItems?: ReviewQueueItem[];
}
