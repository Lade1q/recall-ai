/** Response shape for GET /dashboard/stats (DB-01 "Thống kê nhanh", #230). */
export interface DashboardStatsResponse {
  studyStreakDays: number;
  weeklyStudyMinutes: number;
  conceptsMastered: number;
  conceptsTotal: number;
}
