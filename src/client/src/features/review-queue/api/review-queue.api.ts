import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { ReviewItemStatus, ReviewQueueListResponse } from '../types/review-queue.types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** Trần `limit` của cả hai mảng theo `docs/api/review-queue.md` (mục 1) — server từ chối giá trị
 *  lớn hơn (400). Màn Hàng đợi ôn (#225) hiển thị TOÀN BỘ hàng đợi của một plan nên luôn xin
 *  trần, thay vì mặc định 10 của server.
 *
 *  Xuất ra vì đây là trần thật, không phải chi tiết nội bộ: một plan nhiều hơn ngần này mục sẽ bị
 *  cắt, và màn hình phải nói ra điều đó thay vì lặng lẽ hiển thị một danh sách thiếu — chân thẻ
 *  kế hoạch đếm từ DB nên vẫn ra con số đầy đủ, hai chỗ sẽ lệch nhau. */
export const REVIEW_QUEUE_MAX_LIMIT = 50;

interface UpdateReviewQueueItemResponseData {
  item: {
    id: string;
    conceptId: string;
    planId: string;
    status: ReviewItemStatus;
  };
}

interface SnoozeReviewQueueItemResponseData {
  item: UpdateReviewQueueItemResponseData['item'] & {
    /** Mốc mới do SERVER chốt (00:00 ngày mai giờ VN) — client không gửi ngày lên, chỉ đọc về. */
    scheduledFor: string | null;
  };
}

export const reviewQueueApi = {
  /** GET /review-queue/today — nguồn duy nhất cho lối vào /focus khi chưa chọn khái niệm. */
  getToday: async (limit?: number): Promise<ReviewQueueListResponse> => {
    const response = await apiClient.get<ApiEnvelope<ReviewQueueListResponse>>(
      ENDPOINTS.REVIEW_QUEUE.TODAY,
      { params: limit ? { limit } : undefined }
    );
    return response.data.data;
  },

  /** GET /review-queue?planId= — toàn bộ hàng đợi của MỘT plan (#225), sửa được. Khác `/today`:
   *  không lọc `scheduledFor`, có fallback A3 cho plan chưa từng vấn đáp. */
  getReviewQueue: async (
    planId: string,
    options: { includeSkipped?: boolean } = {}
  ): Promise<ReviewQueueListResponse> => {
    const response = await apiClient.get<ApiEnvelope<ReviewQueueListResponse>>(
      ENDPOINTS.REVIEW_QUEUE.BASE,
      {
        params: {
          planId,
          limit: REVIEW_QUEUE_MAX_LIMIT,
          // Server chỉ nhận đúng chữ "true"/"false" — không truyền gì khi tắt, để `skippedItems`
          // vắng mặt hẳn trên response thay vì bị hiểu nhầm thành `includeSkipped=false`.
          ...(options.includeSkipped ? { includeSkipped: 'true' } : {}),
        },
      }
    );
    return response.data.data;
  },

  /** PATCH /review-queue/:itemId — "Bỏ khỏi lịch" (`skipped`) / "Đưa lại vào lịch" (`pending`).
   *  Áp cho cả cụm hàng của khái niệm đó (#232), response vẫn trả đúng item được gửi lên. */
  updateReviewQueueItem: async (
    itemId: string,
    status: ReviewItemStatus
  ): Promise<UpdateReviewQueueItemResponseData['item']> => {
    const response = await apiClient.patch<ApiEnvelope<UpdateReviewQueueItemResponseData>>(
      ENDPOINTS.REVIEW_QUEUE.ITEM(itemId),
      { status }
    );
    return response.data.data.item;
  },

  /** PATCH /review-queue/:itemId — "Hoãn đến mai" (DB-09 / #233). CÙNG endpoint với hàm trên, chỉ
   *  khác hình dạng body; server phân biệt bằng key. Không gửi ngày lên: biên "đầu ngày mai theo
   *  giờ VN" là của server, client chỉ giơ cờ. Mục vẫn ở trên lịch, `status` không đổi — khác hẳn
   *  `'skipped'`. Cũng áp cho cả cụm hàng của khái niệm (#232). */
  snoozeReviewQueueItem: async (
    itemId: string
  ): Promise<SnoozeReviewQueueItemResponseData['item']> => {
    const response = await apiClient.patch<ApiEnvelope<SnoozeReviewQueueItemResponseData>>(
      ENDPOINTS.REVIEW_QUEUE.ITEM(itemId),
      { snooze: true }
    );
    return response.data.data.item;
  },
};
