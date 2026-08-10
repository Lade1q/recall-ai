/** Mirror của `DashboardStatsResponse` server (`types/dashboard.types.ts`, DB-01 #200). */
export interface DashboardStats {
  /** Chuỗi ngày ôn liên tiếp gần nhất (mọi status phiên tính, giờ Asia/Ho_Chi_Minh). */
  studyStreakDays: number;
  /** Tổng phút của FocusSession `completed` neo vào `startedAt` >= đầu tuần (thứ Hai). */
  weeklyStudyMinutes: number;
  /** Số khái niệm active có `masteryScore >= 0.8`, chỉ trên plan `active`. */
  conceptsMastered: number;
  /** Mẫu số của chỉ số trên — tổng khái niệm active của plan `active`. */
  conceptsTotal: number;
}
