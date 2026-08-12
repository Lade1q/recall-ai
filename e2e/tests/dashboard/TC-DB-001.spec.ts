import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedStudentWithoutPlan,
} from '../focus-session/focus-session-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-001: Kiểm tra điều kiện truy cập và xác thực Dashboard', () => {
  test('a) Chưa đăng nhập: redirect về Login, API trả 401', async ({ page, request }) => {
    // 1. Mở trực tiếp route Dashboard khi chưa có phiên đăng nhập.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);

    // 2. Xác minh UI chưa hiển thị bất kỳ dữ liệu Dashboard nào.
    await expect(page.getByText('thời gian học tuần này')).not.toBeVisible();

    // 3. Gọi API Dashboard không có Bearer token và kiểm tra đúng envelope lỗi.
    const response = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`);
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  test('b) Đã đăng nhập: truy cập thành công, API trả 200', async ({ page, request }) => {
    const studentA = await seedStudentWithoutPlan(prisma, 'tc_db_001_valid_a', 'Student A');
    const studentB = await seedStudentWithoutPlan(prisma, 'tc_db_001_valid_b', 'Student B');

    try {
      // 1. Seed số liệu khác nhau cho Student A và Student B để phát hiện lộ dữ liệu chéo.
      const planA = await prisma.studyPlan.create({
        data: { userId: studentA.id, name: 'Plan riêng Student A', status: 'active' },
        select: { id: true },
      });
      const planB = await prisma.studyPlan.create({
        data: { userId: studentB.id, name: 'Plan riêng Student B', status: 'active' },
        select: { id: true },
      });
      await prisma.concept.createMany({
        data: [
          { planId: planA.id, name: 'A mastered', masteryScore: 0.8 },
          { planId: planA.id, name: 'A learning', masteryScore: 0.6 },
          { planId: planB.id, name: 'B mastered 1', masteryScore: 1 },
          { planId: planB.id, name: 'B mastered 2', masteryScore: 0.9 },
          { planId: planB.id, name: 'B mastered 3', masteryScore: 0.8 },
        ],
      });
      await prisma.focusSession.createMany({
        data: [
          {
            userId: studentA.id,
            planId: planA.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 37,
            focusedSeconds: 2220,
            startedAt: new Date(),
            endedAt: new Date(),
          },
          {
            userId: studentB.id,
            planId: planB.id,
            conceptIds: [],
            status: 'completed',
            durationMinutes: 120,
            focusedSeconds: 7200,
            startedAt: new Date(),
            endedAt: new Date(),
          },
        ],
      });

      // 2. Đăng nhập Student A qua UI thật và chờ Dashboard tải đúng số liệu của A.
      await loginViaUi(page, studentA.email);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText('0h 37m', { exact: true })).toBeVisible();
      await expect(page.getByText('1/2', { exact: true })).toBeVisible();
      await expect(page.getByText('2h 0m', { exact: true })).not.toBeVisible();
      await expect(page.getByText('3/3', { exact: true })).not.toBeVisible();

      // 3. Gọi API trực tiếp bằng token của Student A và đối chiếu toàn bộ số liệu định trước.
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(token).toBeTruthy();

      const response = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(response.status()).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: {
          studyStreakDays: 1,
          weeklyStudyMinutes: 37,
          conceptsMastered: 1,
          conceptsTotal: 2,
        },
      });
    } finally {
      // 4. Dọn cả hai user; cascade xóa toàn bộ dữ liệu con vừa seed.
      await prisma.user.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
    }
  });

  test('c) Token hết hạn hoặc log out: API trả 401, UI redirect về Login', async ({
    page,
    request,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'tc_db_001_expired');

    try {
      // 1. Đăng nhập thành công
      await loginViaUi(page, student.email);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Xóa cả hai token để mô phỏng trạng thái đã đăng xuất.
      const token = await page.evaluate(() => {
        const currentToken = localStorage.getItem('access_token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        return currentToken;
      });
      expect(token).toBeTruthy();

      // 3. Gọi API không token và kiểm tra không có payload số liệu đi kèm.
      const responseEmptyToken = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`);
      expect(responseEmptyToken.status()).toBe(401);
      await expect(responseEmptyToken.json()).resolves.toMatchObject({
        success: false,
        error: { code: 'UNAUTHORIZED' },
      });

      // 4. Reload để AuthContext đọc trạng thái đã đăng xuất và xóa dữ liệu Dashboard khỏi UI.
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText(/Student Dashboard/)).not.toBeVisible();
      await expect(page.getByText('thời gian học tuần này')).not.toBeVisible();

      // 5. Gọi bằng token sai chữ ký để xác minh backend từ chối token không hợp lệ/hết hạn.
      const responseInvalidToken = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
        headers: {
          Authorization: `Bearer ${token}_invalid`,
        },
      });
      expect(responseInvalidToken.status()).toBe(401);
      await expect(responseInvalidToken.json()).resolves.toMatchObject({
        success: false,
        error: { code: 'UNAUTHORIZED' },
      });
    } finally {
      // 6. Dọn dữ liệu test kể cả khi assertion thất bại.
      await prisma.user.delete({ where: { id: student.id } });
    }
  });
});
