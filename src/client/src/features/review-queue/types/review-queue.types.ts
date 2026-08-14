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
  /** #345: câu cho ca "đã vấn đáp nhưng khái niệm trong lịch cũ đã bị gỡ khỏi nội dung". Đi riêng
   *  khỏi `message` vì ở ca đó `items` KHÔNG rỗng (đang hiện gợi ý A3) — và vì `!== null` chính là
   *  thứ phân biệt ca này với ca "chưa vấn đáp bao giờ", khỏi phải dò chuỗi. `null` ở mọi ca khác. */
  noScheduleNote: string | null;
  /** #345: đồ thị còn khái niệm nào không — **dữ kiện**, không phải câu chữ. Client chọn KHUNG
   *  (icon/tiêu đề/nút) của trạng thái rỗng từ nó, giống như đang chọn theo `planStatus`. VẮNG MẶT
   *  khi plan chưa `active`: lúc đó server trả về trước khi đếm, và plan `draft` thì vẫn CÓ khái
   *  niệm (đang chờ xác nhận) nên `false` sẽ là nói dối chứ không phải giá trị mặc định. */
  hasActiveConcepts?: boolean;
}
