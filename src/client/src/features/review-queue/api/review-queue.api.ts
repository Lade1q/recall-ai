import { isAxiosError } from 'axios';
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

/**
 * Thao tác nào đang chạy trên `PATCH /review-queue/:itemId`. Cùng một endpoint, ba hình dạng body
 * (`{status}` / `{snooze}` / `{scheduledFor}`), nên cùng một `code` có thể mang hai nghĩa khác
 * nhau — `VALIDATION_ERROR` ở nhánh dời ngày luôn là "ngày trong quá khứ", ở hai nhánh kia là
 * body sai hình dạng, tức lỗi của client.
 */
export type ReviewQueueAction = 'reschedule' | 'remove';

/**
 * Câu tiếng Việt cho lỗi của `PATCH /review-queue/:itemId`.
 *
 * Tệp này trước đây có **0 dòng** xử lý lỗi (#370 A1): mọi mã rơi thẳng qua `catch` của nơi gọi và
 * biến thành một câu cứng viết sẵn ở client. Với `TRACEBACK_REPRESENTATIVE_LOCKED` (#403) thì đó
 * là mất mát thật — server dựng sẵn câu *"Không thể dời ngày: Nền tảng của 'X' mà bạn còn yếu…"*,
 * có **tên khái niệm** trong đó, thứ không hằng số client nào viết ra được.
 *
 * ⚠️ `error-code-contract.test.ts` bắt được "thiếu `case`", nhưng **không** bắt được "có `case` mà
 * hiển thị chữ cứng". Đó chính là kịch bản `PLAN_NOT_ACTIVE` (#350) mà bài test kia sinh ra để
 * ngăn — nên nhánh truy ngược dưới đây render `message` của server, không phải một hằng số.
 */
export function getReviewQueueErrorMessage(error: unknown, action: ReviewQueueAction): string {
  if (!isAxiosError(error)) {
    return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
  if (!error.response) {
    return 'Không kết nối được tới máy chủ. Vui lòng thử lại.';
  }
  const code: string | undefined = error.response.data?.error?.code;
  switch (code) {
    // Hàng đã biến mất giữa lần tải lịch và lần bấm — thường vì một tab khác vừa gỡ nó, hoặc
    // khái niệm đã bị bỏ khỏi tài liệu (#343). Tải lại là hành động đúng, không phải thử lại.
    case 'NOT_FOUND':
      return 'Mục này không còn trong lịch ôn. Vui lòng tải lại trang.';
    case 'VALIDATION_ERROR':
      return action === 'reschedule'
        ? 'Không dời được: ngày bạn chọn đã ở quá khứ.'
        : 'Thông tin gửi lên chưa hợp lệ.';
    // Ngoại lệ của quy ước "không render thẳng error.message", cùng lý do `PLAN_NOT_ACTIVE` ở
    // `focus.api.ts`: câu server NÊU TÊN khái niệm nền tảng đang yếu (`buildReasonText`), nên một
    // hằng số ở đây sẽ nói ít hơn hẳn — và sẽ nói sai ngay khi backend đổi cách chọn khái niệm đó.
    case 'TRACEBACK_REPRESENTATIVE_LOCKED':
      return error.response.data?.error?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại.';
    default:
      return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
}

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

  /** PATCH /review-queue/:itemId — "Dời sang ngày…" của màn Lịch (#403/#405). Hình dạng body thứ
   *  BA của cùng endpoint; server ghi cho cả cụm hàng của khái niệm, đúng như hai nhánh kia.
   *
   *  `dateKey` là chuỗi `YYYY-MM-DD` theo lịch VN — cùng khoá mà `GET /review-queue/schedule` trả
   *  về. Client KHÔNG tự cắt ngày từ một `Date`: cả cây `src/client` không có chỗ nào biết
   *  `Asia/Ho_Chi_Minh`, nên khoá đi vào đây phải là khoá đã đọc ra từ `/schedule`.
   *
   *  🔴 CỐ Ý trả `void`: response của endpoint này **không đáng tin** cho tới khi #426/PR #429 vào.
   *  Với một cụm lai (có hàng `skipped` lẫn `pending`), PATCH vào id của hàng `skipped` trả `200`
   *  kèm **ngày CŨ** trong khi DB đã dời các hàng anh em — cập nhật lạc quan mà đọc con số đó sẽ
   *  vẽ sai ngày rồi "tự xác nhận" bằng chính response. Nguồn sự thật là `/schedule` sau refetch. */
  rescheduleReviewQueueItem: async (itemId: string, dateKey: string): Promise<void> => {
    await apiClient.patch(ENDPOINTS.REVIEW_QUEUE.ITEM(itemId), { scheduledFor: dateKey });
  },
};
