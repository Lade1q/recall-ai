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

test.describe('TC-DB-020: Tìm kiếm node theo tên trên đồ thị', () => {
  test('Làm mờ chính xác node không khớp và xóa tìm kiếm vẫn giữ panel đang mở', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_020', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-020 thiếu P1.');

      // 1. Chuẩn bị năm node có tên và mastery riêng để kiểm tra một, nhiều và không có kết quả.
      const initialConcepts = await prisma.concept.findMany({
        where: { planId: p1.id },
        orderBy: { name: 'asc' },
        select: { id: true },
      });
      const [c1, c2, c3] = initialConcepts;
      if (!c1 || !c2 || !c3) throw new Error('Seed TC-DB-020 thiếu concept mặc định.');
      await Promise.all([
        prisma.concept.update({
          where: { id: c1.id },
          data: { name: 'Cây AVL', masteryScore: 0.8 },
        }),
        prisma.concept.update({
          where: { id: c2.id },
          data: { name: 'Cây nhị phân', masteryScore: 0.6 },
        }),
        prisma.concept.update({
          where: { id: c3.id },
          data: { name: 'Đồ thị có hướng', masteryScore: 0.4 },
        }),
      ]);
      await prisma.concept.createMany({
        data: [
          { planId: p1.id, name: 'Mảng động', masteryScore: null },
          { planId: p1.id, name: 'Ngăn xếp', masteryScore: 0.8 },
        ],
      });

      // 2. Đăng nhập và mở graph đầy đủ của P1 ở chế độ chỉ xem.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      const graphNodes = page.locator('.react-flow__node');
      await expect(graphNodes).toHaveCount(5);
      const searchInput = page.getByLabel('Tìm khái niệm', { exact: true });
      const avlNode = graphNodes.filter({ hasText: 'Cây AVL' });
      const binaryNode = graphNodes.filter({ hasText: 'Cây nhị phân' });
      const directedGraphNode = graphNodes.filter({ hasText: 'Đồ thị có hướng' });
      const arrayNode = graphNodes.filter({ hasText: 'Mảng động' });
      const stackNode = graphNodes.filter({ hasText: 'Ngăn xếp' });

      // 3. Tìm không phân biệt hoa/thường một node và xác nhận bốn node còn lại bị làm mờ.
      await searchInput.fill('cÂy avl');
      await expect(avlNode).not.toHaveClass(/is-dimmed/);
      await expect(binaryNode).toHaveClass(/is-dimmed/);
      await expect(directedGraphNode).toHaveClass(/is-dimmed/);
      await expect(arrayNode).toHaveClass(/is-dimmed/);
      await expect(stackNode).toHaveClass(/is-dimmed/);
      await expect(page.locator('.react-flow__edge')).toHaveCount(1);

      // 4. Tìm theo prefix để chỉ hai node chứa "Cây" còn rõ, không thêm node không liên quan.
      await searchInput.fill('CÂY');
      await expect(avlNode).not.toHaveClass(/is-dimmed/);
      await expect(binaryNode).not.toHaveClass(/is-dimmed/);
      await expect(directedGraphNode).toHaveClass(/is-dimmed/);
      await expect(arrayNode).toHaveClass(/is-dimmed/);
      await expect(stackNode).toHaveClass(/is-dimmed/);

      // 5. Mở panel của một node trước khi chuyển sang trạng thái không có kết quả.
      const detailResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.includes(`/api/v1/plans/${p1.id}/concepts/`) &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await avlNode.click();
      await detailResponse;
      const avlPanel = page.locator('main aside').filter({
        has: page.getByRole('heading', { name: 'Cây AVL', exact: true }),
      });
      await expect(avlPanel).toBeVisible();

      // 6. Tìm tên không tồn tại: toàn bộ node mờ và thông báo có lối xóa bộ lọc xuất hiện.
      await searchInput.fill('không-tồn-tại');
      await expect(page.getByText('Không có khái niệm nào khớp', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Xóa bộ lọc', exact: true })).toBeVisible();
      await expect(avlNode).toHaveClass(/is-dimmed/);
      await expect(binaryNode).toHaveClass(/is-dimmed/);
      await expect(directedGraphNode).toHaveClass(/is-dimmed/);
      await expect(arrayNode).toHaveClass(/is-dimmed/);
      await expect(stackNode).toHaveClass(/is-dimmed/);

      // 7. Xóa từ khóa và xác nhận toàn graph cùng panel đang mở được khôi phục nguyên vẹn.
      await searchInput.fill('');
      await expect(page.getByText('Không có khái niệm nào khớp', { exact: true })).toHaveCount(0);
      await expect(avlNode).not.toHaveClass(/is-dimmed/);
      await expect(binaryNode).not.toHaveClass(/is-dimmed/);
      await expect(directedGraphNode).not.toHaveClass(/is-dimmed/);
      await expect(arrayNode).not.toHaveClass(/is-dimmed/);
      await expect(stackNode).not.toHaveClass(/is-dimmed/);
      await expect(avlPanel).toBeVisible();
    } finally {
      // 8. Dọn toàn bộ dữ liệu seed qua Student để không ảnh hưởng lần chạy sau.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
