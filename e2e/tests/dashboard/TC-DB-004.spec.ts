import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-004: Trạng thái không có plan và tất cả plan hết hạn', () => {
  test('a) Không có study plan: onboarding và CTA mở đúng luồng tạo plan', async ({ page }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_004_a', { hasP1: false });

    try {
      // 1. Đăng nhập Student chưa từng có study plan.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Dashboard hiển thị thông điệp không có plan và onboarding thay vì các khối active.
      await expect(
        page.getByText('Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.', {
          exact: true,
        })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Bắt đầu kế hoạch ôn tập đầu tiên', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sắp đến hạn', exact: true })).toHaveCount(0);

      // 3. CTA phải điều hướng đúng sang luồng tạo plan.
      await page.getByRole('link', { name: 'Tạo kế hoạch đầu tiên', exact: true }).click();
      await expect(page).toHaveURL('/plan/new');
    } finally {
      // 4. Dọn user test kể cả khi assertion/navigation thất bại.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Mọi plan active đã quá deadline: không được hiển thị Dashboard active bình thường', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_004_b', {
      p1Deadline: new Date(Date.now() - 3 * MS_PER_DAY),
      hasP2: true,
      p2Deadline: new Date(Date.now() - MS_PER_DAY),
    });

    try {
      // 1. Chờ response /plans thật trước khi kiểm tra trạng thái vắng plan trên UI.
      const plansResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/plans' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );

      // 2. Đăng nhập Student có toàn bộ plan active nhưng mọi deadline đều đã qua.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);
      await plansResponse;
      await Promise.any([
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true }).waitFor(),
        page.getByText('Chưa có kế hoạch nào đang hoạt động.', { exact: true }).waitFor(),
        page
          .getByRole('heading', { name: 'Bắt đầu kế hoạch ôn tập đầu tiên', exact: true })
          .waitFor(),
      ]);

      // 3. Theo UC-16 E2, đây phải là gợi ý tạo plan mới chứ không phải catalog active bình thường.
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P2', exact: true })
      ).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Tạo kế hoạch/i })).toBeVisible();
    } finally {
      // 4. Dọn dữ liệu test.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('c) Có ít nhất một plan active deadline tương lai: không hiện onboarding/E2', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_004_c');

    try {
      // 1. Đăng nhập Student có P1 active deadline tương lai.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Dashboard hiển thị catalog active và không nhầm sang onboarding/E2.
      await expect(
        page.getByRole('heading', { name: 'Bắt đầu kế hoạch ôn tập đầu tiên', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sắp đến hạn', exact: true })).toBeVisible();
    } finally {
      // 3. Dọn dữ liệu test.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
