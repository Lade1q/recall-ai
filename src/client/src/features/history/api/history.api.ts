import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { InterviewSessionListItem } from '../types/history.types';

/** Backend bọc mọi response trong `{ success: true, data: {...} }`. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * `GET /interviews` không trả metadata phân trang — `data` là một **mảng trần**, không có
 * `total`, `hasMore`, hay header nào. Cách duy nhất biết đã hết dữ liệu là so số phần tử nhận
 * được với `limit` đã xin (xem `PAGE_SIZE` / `useSessionList`).
 *
 * `limit` bị kẹp trần 50 ở service phía server.
 */
export const PAGE_SIZE = 20;

export const historyApi = {
  /**
   * Danh sách phiên kiểm tra của người đang đăng nhập, `startedAt` giảm dần.
   *
   * Không lọc theo `status`: phiên `active` và `paused` cũng nằm trong lịch sử — đó chính là
   * chỗ SPEC_DB-03 AF2 dựa vào để phát hiện phiên PAUSED (extend AE-01 → AE-03).
   *
   * `planId` của người khác trả **404 chứ không 403** (quy ước #115: không tồn tại và không
   * phải của mình phải trông giống hệt nhau).
   */
  listInterviews: async (params: {
    limit?: number;
    offset?: number;
    planId?: string;
  }): Promise<InterviewSessionListItem[]> => {
    const response = await apiClient.get<ApiEnvelope<InterviewSessionListItem[]>>(
      ENDPOINTS.INTERVIEWS.BASE,
      { params }
    );
    return response.data.data;
  },
};
