import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
} from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-029: Dashboard mở đồng thời nhiều tab trình duyệt', () => {
  test('Tab thứ hai nhận mastery mới sau reload; sáu request Focus song song được khử trùng lặp', async ({
    page,
    request,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_029');
    const secondTab = await page.context().newPage();

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-029 thiếu P1.');
      const c1 = await prisma.concept.findFirstOrThrow({
        where: { planId: p1.id, name: 'Concept C1' },
        select: { id: true },
      });

      // 1. Đăng nhập Dashboard rồi mở tab thứ hai cùng phiên xác thực như thao tác duplicate tab.
      await loginViaUi(page, seed.user.email);
      await secondTab.goto('/dashboard');
      const secondTabC1 = secondTab.locator('.react-flow__node').filter({ hasText: 'Concept C1' });
      await expect(secondTabC1.locator('.concept-node__score')).toHaveText('0.20');
      await expect(secondTab.getByText('1/3', { exact: true })).toBeVisible();

      // 2. Cập nhật kết quả Interview từ nguồn bên ngoài tab đang mở để mô phỏng tab thứ nhất hoàn tất.
      await prisma.concept.update({
        where: { id: c1.id },
        data: { masteryScore: 0.9, lastTestedAt: new Date() },
      });

      // 3. Không có realtime sync nên tab thứ hai giữ snapshot trước reload, không crash hoặc tạo phiên.
      await expect(secondTabC1.locator('.concept-node__score')).toHaveText('0.20');
      await expect(secondTab.getByText('1/3', { exact: true })).toBeVisible();

      // 4. Reload tab thứ hai, chờ nguồn graph và stats thật rồi xác nhận mastery mới được phản ánh nhất quán.
      const planResponse = secondTab.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/v1/plans/${p1.id}` &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      const statsResponse = secondTab.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/dashboard/stats' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await secondTab.reload();
      await Promise.all([planResponse, statsResponse]);
      await expect(secondTabC1.locator('.concept-node__score')).toHaveText('0.90');
      await expect(secondTab.getByText('2/3', { exact: true })).toBeVisible();

      // 5. Gửi sáu POST song song cho cùng Student/plan/concept để xác minh API khử trùng lặp.
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(token).toBeTruthy();
      const focusResponses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { planId: p1.id, conceptIds: [c1.id] },
          })
        )
      );
      const statusCodes = focusResponses.map((response) => response.status());
      expect(statusCodes.every((status) => status === 200 || status === 201)).toBe(true);
      expect(statusCodes.filter((status) => status === 201)).toHaveLength(1);
      const focusBodies = await Promise.all(
        focusResponses.map((response) => response.json() as Promise<{ data: { id: string } }>)
      );
      expect(new Set(focusBodies.map((body) => body.data.id)).size).toBe(1);

      // 6. Đối chiếu DB: sáu POST chỉ tạo một Focus running ngoài phiên completed ban đầu.
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id } }))
        .toBe(2);
      await expect
        .poll(() =>
          prisma.focusSession.count({
            where: { userId: seed.user.id, planId: p1.id, status: 'running' },
          })
        )
        .toBe(1);
      await expect
        .poll(() => prisma.interviewSession.count({ where: { userId: seed.user.id } }))
        .toBe(1);
    } finally {
      // 7. Đóng tab duplicate trước khi cascade dọn dữ liệu của Student.
      await secondTab.close();
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
