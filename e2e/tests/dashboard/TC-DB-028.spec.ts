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

test.describe('TC-DB-028: Graph của plan không có concept nào', () => {
  test('Hiển thị empty state cho plan rỗng/deprecated và node đơn cho plan đối chứng', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_028', {
      hasP2: true,
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [pEmpty, pOne] = seed.plans;
      if (!pEmpty || !pOne) throw new Error('Seed TC-DB-028 thiếu P_empty hoặc P1 đối chứng.');

      // 1. Biến P_empty thành graph chỉ chứa concept deprecated để API thực trả về 0 node active.
      await prisma.conceptEdge.deleteMany({ where: { planId: pEmpty.id } });
      await prisma.concept.deleteMany({ where: { planId: pEmpty.id } });
      await prisma.concept.create({
        data: { planId: pEmpty.id, name: 'Concept đã deprecated', status: 'deprecated' },
      });

      // 2. Đăng nhập Dashboard và xác nhận P1 đối chứng chỉ có một node, không có cạnh.
      await loginViaUi(page, seed.user.email);
      const graphSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true }),
      });
      const planSelect = graphSection.getByLabel('Chọn kế hoạch', { exact: true });
      await expect(planSelect).toHaveValue(pOne.id);
      await expect(graphSection.locator('.react-flow__node')).toHaveCount(1);
      await expect(graphSection.locator('.react-flow__edge')).toHaveCount(0);
      await expect(graphSection.getByText('Concept P2C1', { exact: true })).toBeVisible();

      // 3. Đổi sang P_empty để kiểm tra concept deprecated không lọt vào graph đang học.
      const selectEmptyResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/v1/plans/${pEmpty.id}` &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await planSelect.selectOption({ label: 'Plan P1' });
      await selectEmptyResponse;
      await expect(
        graphSection.getByText('Chưa có khái niệm nào trong đồ thị.', { exact: true })
      ).toBeVisible();
      await expect(graphSection.locator('.react-flow__node')).toHaveCount(0);
      await expect(graphSection.getByText('Concept đã deprecated', { exact: true })).toHaveCount(0);

      // 4. Empty state vẫn có lối xem graph đầy đủ, không dựng CTA thêm concept không tồn tại.
      await expect(
        graphSection.getByRole('link', { name: 'Mở đồ thị đầy đủ →', exact: true })
      ).toHaveAttribute('href', `/plan/${pEmpty.id}`);
      await expect(graphSection.getByRole('button', { name: /Thêm khái niệm/ })).toHaveCount(0);
    } finally {
      // 5. Dọn Student cùng toàn bộ plan và concept phụ thuộc sau khi test kết thúc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
