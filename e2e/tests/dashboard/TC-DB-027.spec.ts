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

test.describe('TC-DB-027: Plan bị archived trong khi Student đang mở Dashboard', () => {
  test('Giữ dữ liệu cũ khi chưa tải lại và loại plan archived sau khi reload', async ({ page }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_027', { seedActivity: false });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-027 thiếu P1.');

      // 1. Đăng nhập và xác nhận Dashboard đang hiển thị P1 active cùng mini graph thật.
      await loginViaUi(page, seed.user.email);
      const p1Card = page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true });
      await expect(p1Card).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(3);

      // 2. Mô phỏng tác động bên ngoài archive P1 khi tab Dashboard vẫn đang idle.
      await prisma.studyPlan.update({ where: { id: p1.id }, data: { status: 'archived' } });

      // 3. Không có realtime push nên tab cũ vẫn hiển thị snapshot P1 trước lần fetch kế tiếp.
      await expect(p1Card).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(3);

      // 4. Reload, chờ danh sách plan thật trả về rồi xác nhận Dashboard loại P1 archived.
      const plansResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/plans' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await page.reload();
      await plansResponse;
      await expect(p1Card).toHaveCount(0);
      await expect(
        page.getByText('Chưa có kế hoạch nào đang hoạt động.', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true })
      ).toHaveCount(0);

      // 5. Đối chiếu DB: archive/reload chỉ đổi status, không tự tạo phiên học mới.
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id } }))
        .toBe(0);
      await expect
        .poll(() => prisma.studyPlan.findUniqueOrThrow({ where: { id: p1.id } }))
        .toMatchObject({ status: 'archived' });
    } finally {
      // 6. Dọn dữ liệu Student độc lập sau khi kết thúc mọi assertion.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
