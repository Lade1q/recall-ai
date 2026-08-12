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

test.describe('TC-DB-021: Hover tooltip hiển thị tên và mastery_score của node', () => {
  test('Tooltip cập nhật đúng cho node chưa kiểm tra, đang học và vững', async ({ page }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_021', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-021 thiếu P1.');

      // 1. Đặt ba node đại diện cho score null, 0.60 và 0.80 cùng trạng thái ngày kiểm tra rõ ràng.
      const concepts = await prisma.concept.findMany({
        where: { planId: p1.id },
        orderBy: { name: 'asc' },
        select: { id: true },
      });
      const [c1, c4, c6] = concepts;
      if (!c1 || !c4 || !c6) throw new Error('Seed TC-DB-021 thiếu concept mặc định.');
      await Promise.all([
        prisma.concept.update({
          where: { id: c1.id },
          data: { name: 'C1', masteryScore: null, lastTestedAt: null },
        }),
        prisma.concept.update({
          where: { id: c4.id },
          data: { name: 'C4', masteryScore: 0.6, lastTestedAt: new Date() },
        }),
        prisma.concept.update({
          where: { id: c6.id },
          data: { name: 'C6', masteryScore: 0.8, lastTestedAt: new Date() },
        }),
      ]);

      // 2. Đăng nhập và mở graph chỉ xem, nơi hover không được mở panel chi tiết.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      const c1Node = page.locator('.react-flow__node').filter({ hasText: /^C1—$/ });
      const c4Node = page.locator('.react-flow__node').filter({ hasText: /^C40\.60$/ });
      const c6Node = page.locator('.react-flow__node').filter({ hasText: /^C60\.80$/ });
      await expect(c1Node).toBeVisible();
      await expect(c4Node).toBeVisible();
      await expect(c6Node).toBeVisible();
      await expect(page.locator('main aside')).toHaveCount(0);

      // 3. Hover C1: tooltip dùng dấu — và "chưa kiểm tra", không hiển thị null hoặc 0 giả.
      await c1Node.hover();
      const c1Tooltip = page.locator('.react-flow__node-toolbar').filter({ hasText: /^C1/ });
      await expect(c1Tooltip).toBeVisible();
      await expect(c1Tooltip).toContainText('C1');
      await expect(c1Tooltip).toContainText('—');
      await expect(c1Tooltip).toContainText('chưa kiểm tra');
      await expect(c1Tooltip).not.toContainText('null');
      await expect(c1Node.locator('[data-slot="concept-node"]')).toHaveAttribute(
        'data-band',
        'untested'
      );
      await expect(page.locator('main aside')).toHaveCount(0);

      // 4. Hover C4 để tooltip đổi sang đúng tên, score hai chữ số và dải Đang học.
      await c4Node.hover();
      const c4Tooltip = page.locator('.react-flow__node-toolbar').filter({ hasText: /^C4/ });
      await expect(c4Tooltip).toBeVisible();
      await expect(c4Tooltip).toContainText('C4');
      await expect(c4Tooltip).toContainText('0.60');
      await expect(c4Tooltip).toContainText('kiểm tra lần cuối');
      await expect(c4Node.locator('[data-slot="concept-node"]')).toHaveAttribute(
        'data-band',
        'learning'
      );

      // 5. Hover liên tiếp C6 để xác nhận tooltip không giữ dữ liệu cũ và dải chuyển sang Vững.
      await c6Node.hover();
      const c6Tooltip = page.locator('.react-flow__node-toolbar').filter({ hasText: /^C6/ });
      await expect(c6Tooltip).toBeVisible();
      await expect(c6Tooltip).toContainText('C6');
      await expect(c6Tooltip).toContainText('0.80');
      await expect(c6Tooltip).not.toContainText('C4');
      await expect(c6Node.locator('[data-slot="concept-node"]')).toHaveAttribute(
        'data-band',
        'strong'
      );

      // 6. Rê ra vùng canvas trống để tooltip ẩn mà không kích hoạt panel của C6.
      const pane = page.locator('.react-flow__pane').first();
      await pane.hover({ position: { x: 10, y: 10 } });
      await expect(c6Tooltip).not.toBeVisible();
      await expect(page.locator('main aside')).toHaveCount(0);
    } finally {
      // 7. Dọn toàn bộ dữ liệu của Student độc lập sau từng lần chạy.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
