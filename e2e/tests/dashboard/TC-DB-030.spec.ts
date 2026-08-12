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

test.describe('TC-DB-030: Nút Back sau khi đã rời Dashboard đến Interview/Focus', () => {
  test('Back từ màn hình thiết lập Focus trở về Dashboard đầy đủ mà không tạo session rỗng', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_030', { seedActivity: false });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-030 thiếu P1.');

      // 1. Đăng nhập Dashboard có gợi ý, graph, chỉ số và danh mục kế hoạch thật.
      await loginViaUi(page, seed.user.email);
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(3);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 2. Đi theo CTA Focus từ Dashboard và dừng ở setup, trước thao tác Bắt đầu tạo session.
      const focusLink = page.getByRole('link', { name: 'Bắt đầu Focus Session', exact: true });
      await Promise.all([
        page.waitForURL(new RegExp(`/focus\\?planId=${p1.id}&conceptId=`)),
        focusLink.click(),
      ]);
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();

      // 3. Nhấn Back của trình duyệt và xác nhận Dashboard render lại đầy đủ, không phải trang trắng.
      await page.goBack();
      await expect(page).toHaveURL('/dashboard');
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(3);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 4. Đối chiếu DB: chỉ navigate/back không được tạo Focus Session rỗng.
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id } }))
        .toBe(0);
    } finally {
      // 5. Dọn Student độc lập cùng mọi dữ liệu Dashboard sau khi test hoàn tất.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
