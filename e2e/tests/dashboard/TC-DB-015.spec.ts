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
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const dateAtVnMidnight = Date.UTC(read('year'), read('month') - 1, read('day'));
  const daysSinceMonday = (new Date(dateAtVnMidnight).getUTCDay() + 6) % 7;
  return new Date(dateAtVnMidnight - daysSinceMonday * 24 * 60 * 60 * 1000 - 7 * 60 * 60 * 1000);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-015: Mốc tuần Asia/Ho_Chi_Minh', () => {
  test('Chỉ Focus completed từ 00:00 thứ Hai giờ Việt Nam được cộng vào tuần hiện tại', async ({
    page,
    request,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'tc_db_015', 'Student Week Boundary');

    try {
      const weekStart = getExpectedVnWeekStartUtc(new Date());
      const plan = await prisma.studyPlan.create({
        data: { userId: student.id, name: 'Plan week boundary', status: 'active' },
        select: { id: true },
      });

      // 1. Seed sát hai phía biên tuần VN và một session trạng thái không hợp lệ.
      await prisma.focusSession.createMany({
        data: [
          {
            userId: student.id,
            planId: plan.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 10,
            startedAt: new Date(weekStart.getTime() - 1),
            endedAt: new Date(weekStart.getTime() - 1),
          },
          {
            userId: student.id,
            planId: plan.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 20,
            startedAt: weekStart,
            endedAt: weekStart,
          },
          {
            userId: student.id,
            planId: plan.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 30,
            startedAt: new Date(weekStart.getTime() + 30 * 60 * 1000),
            endedAt: new Date(weekStart.getTime() + 30 * 60 * 1000),
          },
          {
            userId: student.id,
            planId: plan.id,
            conceptIds: [],
            status: 'running',
            durationMinutes: 40,
            startedAt: new Date(weekStart.getTime() + 60 * 60 * 1000),
          },
        ],
      });

      // 2. Gọi API bằng phiên đăng nhập thật và đối chiếu chính xác tổng phút tại biên tuần.
      await loginViaUi(page, student.email);
      await page.goto('/dashboard');
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(token).toBeTruthy();
      const response = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status()).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        data: { weeklyStudyMinutes: 50 },
      });
      await expect(page.getByText('0h 50m', { exact: true })).toBeVisible();
    } finally {
      // 3. Xóa user sau khi không còn request API nào đang chờ response.
      await prisma.user.delete({ where: { id: student.id } });
    }
  });
});
