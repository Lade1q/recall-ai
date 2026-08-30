import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { ScheduleResponse } from '../types/schedule.types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const scheduleApi = {
  /**
   * GET /review-queue/schedule — toàn bộ lịch ôn, mỗi mục kèm `scheduledFor` + `dateKey` (#402).
   *
   * Không tham số **có chủ đích**: thanh "Còn nợ" cần mọi mục quá hạn bất kể tháng đang xem, nên
   * cắt theo khoảng thời gian ở server là tự bắn chân. Lọc và nhóm chạy ở client trên trọn mảng.
   */
  getSchedule: async (): Promise<ScheduleResponse> => {
    const response = await apiClient.get<ApiEnvelope<ScheduleResponse>>(
      ENDPOINTS.REVIEW_QUEUE.SCHEDULE
    );
    return response.data.data;
  },
};
