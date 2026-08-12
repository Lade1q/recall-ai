import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedStudentWithoutPlan,
} from '../focus-session/focus-session-test-utils';

const prisma = createTestPrismaClient();

function vnNoonUtc(daysFromToday: number): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(read('year'), read('month') - 1, read('day') + daysFromToday, 5));
}

async function fetchStreak(token: string, request: APIRequestContext) {
  const response = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { success: boolean; data: { studyStreakDays: number } };
  expect(body.success).toBe(true);
  return body.data.studyStreakDays;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-016: Study streak theo ngày Việt Nam', () => {
  test('Gộp Focus/Interview mọi status, giữ streak hôm qua và đứt đúng khi thiếu ngày giữa', async ({
    page,
    request,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'tc_db_016', 'Student Streak');

    try {
      const plan = await prisma.studyPlan.create({
        data: { userId: student.id, name: 'Plan streak', status: 'active' },
        select: { id: true },
      });

      // 1. Seed hôm nay/hôm qua/hôm kia từ cả hai nguồn với các status khác nhau.
      const [todayFocus, yesterdayInterview] = await Promise.all([
        prisma.focusSession.create({
          data: {
            userId: student.id,
            planId: plan.id,
            conceptIds: [],
            status: 'running',
            startedAt: vnNoonUtc(0),
          },
          select: { id: true },
        }),
        prisma.interviewSession.create({
          data: {
            userId: student.id,
            planId: plan.id,
            conceptQueue: [],
            status: 'abandoned',
            startedAt: vnNoonUtc(-1),
          },
          select: { id: true },
        }),
      ]);
      await prisma.focusSession.create({
        data: {
          userId: student.id,
          planId: plan.id,
          conceptIds: [],
          status: 'completed',
          durationMinutes: 1,
          startedAt: vnNoonUtc(-2),
          endedAt: vnNoonUtc(-2),
        },
      });

      // 2. Đăng nhập và kiểm tra 3 ngày liên tiếp, không phụ thuộc trạng thái session.
      await loginViaUi(page, student.email);
      await page.goto('/dashboard');
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(token).toBeTruthy();
      expect(await fetchStreak(token!, request)).toBe(3);
      await expect(page.getByText('3', { exact: true })).toBeVisible();

      // 3. Bỏ hoạt động hôm nay: streak hôm qua vẫn còn sống và đếm đúng 2 ngày.
      await prisma.focusSession.delete({ where: { id: todayFocus.id } });
      await page.reload();
      expect(await fetchStreak(token!, request)).toBe(2);
      await expect(page.getByText('2', { exact: true })).toBeVisible();

      // 4. Bỏ hôm qua nhưng thêm lại hôm nay: thiếu ngày giữa nên streak chỉ còn 1.
      await prisma.interviewSession.delete({ where: { id: yesterdayInterview.id } });
      await prisma.focusSession.create({
        data: {
          userId: student.id,
          planId: plan.id,
          conceptIds: [],
          status: 'cancelled',
          startedAt: vnNoonUtc(0),
        },
      });
      await page.reload();
      expect(await fetchStreak(token!, request)).toBe(1);
      await expect(page.getByText('1', { exact: true })).toBeVisible();
    } finally {
      // 5. Dọn user sau các lần reload và request API cuối cùng.
      await prisma.user.delete({ where: { id: student.id } });
    }
  });
});
