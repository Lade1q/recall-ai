import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedStudentWithoutPlan,
} from '../focus-session/focus-session-test-utils';

const prisma = createTestPrismaClient();

function getExpectedVnWeekStartUtc(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(Date.UTC(year, month - 1, day - daysSinceMonday) - 7 * 60 * 60 * 1000);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-014: Ba chỉ số thống kê Dashboard theo dữ liệu hợp lệ', () => {
  test('API/UI tổng hợp 55 phút và 2/4 mastery, rồi trả 0 khi không còn Focus completed tuần này', async ({
    page,
    request,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'tc_db_014', 'Student Stats');

    try {
      const now = new Date();
      const weekStart = getExpectedVnWeekStartUtc(now);

      // 1. Seed plan active/archived, concept active/deprecated và session với trạng thái/thời điểm khác nhau.
      const [activePlan, archivedPlan] = await Promise.all([
        prisma.studyPlan.create({
          data: { userId: student.id, name: 'Plan active stats', status: 'active' },
          select: { id: true },
        }),
        prisma.studyPlan.create({
          data: { userId: student.id, name: 'Plan archived stats', status: 'archived' },
          select: { id: true },
        }),
      ]);
      await prisma.concept.createMany({
        data: [
          { planId: activePlan.id, name: 'Null', masteryScore: null },
          { planId: activePlan.id, name: 'Half', masteryScore: 0.5 },
          { planId: activePlan.id, name: 'Strong 80', masteryScore: 0.8 },
          { planId: activePlan.id, name: 'Strong 90', masteryScore: 0.9 },
          {
            planId: activePlan.id,
            name: 'Deprecated strong',
            masteryScore: 0.9,
            status: 'deprecated',
          },
          { planId: archivedPlan.id, name: 'Archived strong', masteryScore: 0.9 },
        ],
      });
      await prisma.focusSession.createMany({
        data: [
          {
            userId: student.id,
            planId: activePlan.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 25,
            startedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
            endedAt: now,
          },
          {
            userId: student.id,
            planId: activePlan.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 30,
            startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
            endedAt: now,
          },
          {
            userId: student.id,
            planId: activePlan.id,
            conceptIds: [],
            status: 'running',
            durationMinutes: 40,
            startedAt: new Date(now.getTime() - 60 * 60 * 1000),
          },
          {
            userId: student.id,
            planId: activePlan.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 60,
            startedAt: new Date(weekStart.getTime() - 1),
            endedAt: new Date(weekStart.getTime() - 1),
          },
        ],
      });

      // 2. Đăng nhập và đối chiếu envelope API cùng các giá trị Dashboard hiển thị.
      await loginViaUi(page, student.email);
      await page.goto('/dashboard');
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(token).toBeTruthy();
      const initialResponse = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(initialResponse.status()).toBe(200);
      await expect(initialResponse.json()).resolves.toEqual({
        success: true,
        data: {
          studyStreakDays: 1,
          weeklyStudyMinutes: 55,
          conceptsMastered: 2,
          conceptsTotal: 4,
        },
      });
      await expect(page.getByText('0h 55m', { exact: true })).toBeVisible();
      await expect(page.getByText('2/4', { exact: true })).toBeVisible();
      await expect(page.getByText('thời gian học tuần này', { exact: true })).toBeVisible();
      await expect(
        page.getByText('khái niệm đạt mastery_score ≥ 0.8', { exact: true })
      ).toBeVisible();

      // 3. Chuyển mọi Focus completed trong tuần thành cancelled để xác minh aggregate trả số 0.
      await prisma.focusSession.updateMany({
        where: {
          userId: student.id,
          status: 'completed',
          startedAt: { gte: weekStart },
        },
        data: { status: 'cancelled' },
      });
      await page.reload();
      const zeroResponse = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(zeroResponse.status()).toBe(200);
      await expect(zeroResponse.json()).resolves.toMatchObject({
        success: true,
        data: { weeklyStudyMinutes: 0, conceptsMastered: 2, conceptsTotal: 4 },
      });
      await expect(page.getByText('0h 0m', { exact: true })).toBeVisible();
    } finally {
      // 4. Dọn dữ liệu Student Stats sau khi mọi request đọc đã hoàn tất.
      await prisma.user.delete({ where: { id: student.id } });
    }
  });
});
