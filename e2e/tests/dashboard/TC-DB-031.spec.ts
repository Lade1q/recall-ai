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

test.describe('TC-DB-031: Tên concept rất dài trong node graph', () => {
  test('Cắt tên dài trong node nhưng giữ nguyên tooltip/panel và không thực thi chuỗi đặc biệt', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_031', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-031 thiếu P1.');
      const longName =
        'Giải tích hàm nhiều biến và tích phân bội trong không gian Euclide <script>window.__tcDb31Xss=true</script> 🧠';
      const concepts = await prisma.concept.findMany({
        where: { planId: p1.id },
        orderBy: { name: 'asc' },
        select: { id: true },
      });
      const [shortConcept, mediumConcept, longConcept] = concepts;
      if (!shortConcept || !mediumConcept || !longConcept) {
        throw new Error('Seed TC-DB-031 thiếu concept mặc định.');
      }

      // 1. Chuẩn bị tên ngắn, trung bình và tên rất dài chứa diacritics, emoji và payload XSS.
      await Promise.all([
        prisma.concept.update({ where: { id: shortConcept.id }, data: { name: 'Stack' } }),
        prisma.concept.update({
          where: { id: mediumConcept.id },
          data: { name: 'Cây nhị phân cân bằng' },
        }),
        prisma.concept.update({ where: { id: longConcept.id }, data: { name: longName } }),
      ]);
      await page.addInitScript(() => {
        (window as Window & { __tcDb31Xss?: boolean }).__tcDb31Xss = false;
      });

      // 2. Đăng nhập và mở graph đầy đủ để kiểm tra trình bày node lẫn panel chi tiết.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      const shortNode = page.locator('.react-flow__node').filter({ hasText: 'Stack' });
      const mediumNode = page
        .locator('.react-flow__node')
        .filter({ hasText: 'Cây nhị phân cân bằng' });
      const longNode = page.locator('.react-flow__node').filter({ hasText: longName });
      await expect(shortNode).toBeVisible();
      await expect(mediumNode).toBeVisible();
      await expect(longNode).toBeVisible();

      // 3. Xác nhận tên dài bị ellipsis trong vùng node cố định, không làm rộng graph hoặc che score.
      const longLabel = longNode.locator('.concept-node__name');
      await expect(longLabel).toHaveText(longName);
      const longLabelOverflows = await longLabel.evaluate(
        (element) => element.scrollWidth > element.clientWidth
      );
      expect(longLabelOverflows).toBe(true);
      await expect(longNode.locator('.concept-node__score')).toBeVisible();

      // 4. Hover node dài để kiểm tra tooltip giữ nguyên toàn bộ chuỗi thay vì copy ellipsis.
      await longNode.hover();
      const longTooltip = page.locator('.react-flow__node-toolbar').filter({ hasText: longName });
      await expect(longTooltip).toBeVisible();
      await expect(longTooltip).toContainText(longName);

      // 5. Click node dài, chờ API chi tiết thật rồi kiểm tra panel hiển thị trọn vẹn tên concept.
      const detailResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.includes(`/api/v1/plans/${p1.id}/concepts/`) &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await longNode.click();
      await detailResponse;
      const longPanel = page.locator('main aside').filter({
        has: page.getByRole('heading', { name: longName, exact: true }),
      });
      await expect(longPanel).toBeVisible();

      // 6. Chuỗi đặc biệt chỉ được render như text: không có thẻ script và không đổi trạng thái trang.
      await expect(page.locator('.react-flow__node script')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => (window as Window & { __tcDb31Xss?: boolean }).__tcDb31Xss))
        .toBe(false);
    } finally {
      // 7. Dọn dữ liệu Student độc lập sau khi hoàn tất kiểm tra giao diện.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
