import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { DashboardStats } from '../types/dashboard.types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const dashboardApi = {
  /** GET /dashboard/stats (DB-01 #200) — ba con số của dải chỉ số, số học thuần, không AI.
   *  Nguồn dữ liệu độc lập với `/review-queue/today` và `/plans` (một cái hỏng không kéo hai
   *  cái kia). Đừng tự cộng `masteryDistribution` từ `/plans` — hai nguồn khớp nhau nhưng chỉ
   *  endpoint này lọc plan `status='active'`, xem ràng buộc trong #169. */
  getStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get<ApiEnvelope<DashboardStats>>(ENDPOINTS.DASHBOARD.STATS);
    return response.data.data;
  },
};
