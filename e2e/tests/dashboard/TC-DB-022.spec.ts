import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-022: Lỗi tải riêng dữ liệu đồ thị khái niệm', () => {
  test('Lỗi tải mini graph không ảnh hưởng các khối Dashboard và Thử lại dùng dữ liệu thật', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_022');

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-022 thiếu P1.');

      let shouldFailGraphRequest = true;
      let graphFailureCount = 0;
      // 1. Chỉ lỗi lần GET chi tiết P1 của mini graph; các API Dashboard khác vẫn đi backend thật.
      await page.route('**/*', async (route) => {
        const request = route.request();
        const isTargetGraphRequest =
          new URL(request.url()).pathname === `/api/v1/plans/${p1.id}` &&
          request.method() === 'GET';
        if (isTargetGraphRequest && shouldFailGraphRequest) {
          graphFailureCount += 1;
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'Lỗi tải graph dùng cho kiểm thử.' }),
          });
          return;
        }
        await route.continue();
      });

      // 2. Đăng nhập và mở Dashboard với mini graph bị lỗi tải độc lập.
      await loginViaUi(page, seed.user.email);
      const graphSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true }),
      });
      await expect(
        graphSection.getByText('Không tải được đồ thị của kế hoạch này.', { exact: true })
      ).toBeVisible();
      await expect(
        graphSection.getByRole('button', { name: 'Thử lại', exact: true })
      ).toBeVisible();
      expect(graphFailureCount).toBeGreaterThan(0);

      // 3. Kiểm tra danh mục, gợi ý và chỉ số thật vẫn hiển thị khi chỉ graph lỗi.
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();
      await expect(page.getByText('thời gian học tuần này', { exact: true })).toBeVisible();

      // 4. Nhấn Thử lại sau khi fault injection đã qua và chờ response 200 từ backend thật.
      const retryResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/v1/plans/${p1.id}` &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      shouldFailGraphRequest = false;
      await graphSection.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await retryResponse;

      // 5. Xác nhận error biến mất và mini graph được dựng từ ba concept thật của P1.
      await expect(
        graphSection.getByText('Không tải được đồ thị của kế hoạch này.', { exact: true })
      ).toHaveCount(0);
      await expect(graphSection.locator('.react-flow__node')).toHaveCount(3);
      await expect(graphSection.getByText('3 khái niệm', { exact: true })).toBeVisible();
    } finally {
      // 6. Dọn dữ liệu độc lập của Student, không để lại plan hay hàng đợi cho test khác.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
