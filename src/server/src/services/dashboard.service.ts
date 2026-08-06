import prisma from '../config/prisma';
import { MASTERY_STRONG_THRESHOLD } from '../utils/mastery';
import {
  computeStreakDays,
  getStreakLookbackStartUtc,
  getVnWeekStartUtc,
  toVnDateKey,
} from '../utils/dashboard-stats';
import { DashboardStatsResponse } from '../types/dashboard.types';

/**
 * DB-01 "Thống kê nhanh" (#230). Số học thuần trên dữ liệu đã có — không AI, không cron, tính
 * ngay lúc query (cùng triết lý #124, xem `scheduling.service.ts`). Endpoint chỉ đọc: không
 * đụng tới `concepts.mastery_score` / `lastTestedAt` ở bất kỳ đâu trong file này.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStatsResponse> {
  const now = new Date();
  const weekStartUtc = getVnWeekStartUtc(now);
  // Streak chỉ cần các ngày liên tiếp gần nhất — quét toàn bộ lịch sử phiên mỗi lần vào
  // Dashboard sẽ tăng chi phí tuyến tính theo tuổi tài khoản mà không đổi kết quả streak.
  const streakLookbackStart = getStreakLookbackStartUtc(now);

  const [interviewSessions, focusSessions, weeklyAgg, activePlans] = await Promise.all([
    prisma.interviewSession.findMany({
      where: { userId, startedAt: { gte: streakLookbackStart } },
      select: { startedAt: true },
    }),
    prisma.focusSession.findMany({
      where: { userId, startedAt: { gte: streakLookbackStart } },
      select: { startedAt: true },
    }),
    prisma.focusSession.aggregate({
      where: { userId, status: 'completed', startedAt: { gte: weekStartUtc } },
      _sum: { durationMinutes: true },
    }),
    prisma.studyPlan.findMany({
      where: { userId, status: 'active' },
      select: { concepts: { where: { status: 'active' }, select: { masteryScore: true } } },
    }),
  ]);

  // Streak tính trên MỌI status của cả hai loại phiên — mở phiên ôn tập đã là "quay lại học"
  // hôm đó, bất kể có hoàn thành hay không; lọc theo completed sẽ khiến streak đứt oan khi
  // phiên bị gián đoạn (đóng tab, bị lazy-reap thành cancelled sau 8h).
  const activeDateKeys = new Set<string>([
    ...interviewSessions.map((session) => toVnDateKey(session.startedAt)),
    ...focusSessions.map((session) => toVnDateKey(session.startedAt)),
  ]);
  const concepts = activePlans.flatMap((plan) => plan.concepts);

  return {
    studyStreakDays: computeStreakDays(activeDateKeys, now),
    weeklyStudyMinutes: weeklyAgg._sum.durationMinutes ?? 0,
    conceptsMastered: concepts.filter(
      (concept) => (concept.masteryScore ?? 0) >= MASTERY_STRONG_THRESHOLD
    ).length,
    conceptsTotal: concepts.length,
  };
}
