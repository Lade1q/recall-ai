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

test.describe('TC-DB-017: Contract stats và phục hồi lỗi tải', () => {
  test('Stats trả contract thật; lỗi mạng không biến thành số 0 và retry lấy dữ liệu mới', async ({
    page,
    request,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_017', { emptyQueue: true });

    try {
      // 1. Đăng nhập và kiểm tra contract thành công từ server thật trước khi inject lỗi.
      await loginViaUi(page, seed.user.email);
      await page.goto('/dashboard');
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(token).toBeTruthy();
      const response = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        success: boolean;
        data: Record<string, unknown>;
      };
      expect(body.success).toBe(true);
      for (const key of [
        'studyStreakDays',
        'weeklyStudyMinutes',
        'conceptsMastered',
        'conceptsTotal',
      ]) {
        expect(body.data[key]).toEqual(expect.any(Number));
        expect(body.data[key]).toBeGreaterThanOrEqual(0);
      }
      await expect(page.getByText('0h 25m', { exact: true })).toBeVisible();

      // 2. Chỉ chặn request stats để mô phỏng lỗi mạng, giữ các API Dashboard khác thật.
      await page.route('**/api/v1/dashboard/stats', (route) => route.abort('failed'));
      await page.reload();
      await expect(
        page.getByText('Không tải được các chỉ số nhanh.', { exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
      await expect(page.getByText('0h 25m', { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 3. Bỏ fault injection rồi retry để UI thay error state bằng response thật, không giữ stale error.
      await page.unroute('**/api/v1/dashboard/stats');
      await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await expect(page.getByText('0h 25m', { exact: true })).toBeVisible();
      await expect(page.getByText('Không tải được các chỉ số nhanh.', { exact: true })).toHaveCount(
        0
      );
    } finally {
      // 4. Gỡ route phòng trường hợp assertion thất bại rồi dọn user test.
      await page.unroute('**/api/v1/dashboard/stats');
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
