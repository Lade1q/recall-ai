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

test.describe('TC-DB-010: Cảnh báo graph lớn và bộ lọc mastery hiện có', () => {
  test('Ngưỡng 50/51, subset mặc định, filter Yếu và reset hoạt động đúng phạm vi hiện tại', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_010', {
      hasP2: true,
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const p50 = seed.plans.find((plan) => plan.name === 'Plan P1');
      const p51 = seed.plans.find((plan) => plan.name === 'Plan P2');
      if (!p50 || !p51) throw new Error('Seed TC-DB-010 thiếu hai plan 50/51 node.');

      // 1. Thay graph mẫu bằng P50 và P51 có các mastery band xác định.
      await prisma.concept.deleteMany({ where: { planId: { in: [p50.id, p51.id] } } });
      await prisma.concept.createMany({
        data: Array.from({ length: 50 }, (_, index) => ({
          planId: p50.id,
          name: `P50 Node ${String(index + 1).padStart(2, '0')}`,
          masteryScore: 0.9,
        })),
      });
      const [strongPrerequisite, weakNode] = await Promise.all([
        prisma.concept.create({
          data: { planId: p51.id, name: 'Prerequisite Strong', masteryScore: 0.9 },
          select: { id: true },
        }),
        prisma.concept.create({
          data: { planId: p51.id, name: 'Weak Node', masteryScore: 0.4 },
          select: { id: true },
        }),
      ]);
      await prisma.concept.createMany({
        data: [
          { planId: p51.id, name: 'Learning Node', masteryScore: 0.6 },
          { planId: p51.id, name: 'Untested Node', masteryScore: null },
          ...Array.from({ length: 47 }, (_, index) => ({
            planId: p51.id,
            name: `Strong Filler ${String(index + 1).padStart(2, '0')}`,
            masteryScore: 0.9,
          })),
        ],
      });
      await prisma.conceptEdge.create({
        data: {
          planId: p51.id,
          fromConceptId: strongPrerequisite.id,
          toConceptId: weakNode.id,
        },
      });

      // 2. P50 không được kích hoạt cảnh báo graph lớn chỉ vì chạm ngưỡng 50.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p50.id}`);
      await expect(page.getByRole('button', { name: /Hiện toàn bộ .* node/ })).toHaveCount(0);

      // 3. P51 chỉ vẽ node yếu cùng tiền quyết trực tiếp trước khi người dùng mở toàn bộ.
      await page.goto(`/plan/${p51.id}`);
      const showAll = page.getByRole('button', { name: 'Hiện toàn bộ 51 node', exact: true });
      await expect(showAll).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(2);
      await showAll.click();
      await expect(page.locator('.react-flow__node')).toHaveCount(51);

      // 4. Filter Yếu giữ node yếu rõ ràng và làm mờ mọi mastery band còn lại theo UI hiện có.
      await page.getByRole('button', { name: 'Yếu', exact: true }).click();
      await expect(page.getByText('Yếu · 1 / 51 khái niệm', { exact: true })).toBeVisible();
      const weakGraphNode = page.locator('.react-flow__node').filter({ hasText: 'Weak Node' });
      const strongGraphNode = page
        .locator('.react-flow__node')
        .filter({ hasText: 'Prerequisite Strong' });
      const learningGraphNode = page
        .locator('.react-flow__node')
        .filter({ hasText: 'Learning Node' });
      const untestedGraphNode = page
        .locator('.react-flow__node')
        .filter({ hasText: 'Untested Node' });
      await expect(weakGraphNode).not.toHaveClass(/is-dimmed/);
      await expect(strongGraphNode).toHaveClass(/is-dimmed/);
      await expect(learningGraphNode).toHaveClass(/is-dimmed/);
      await expect(untestedGraphNode).toHaveClass(/is-dimmed/);

      // 5. Reset khôi phục graph đầy đủ và không làm mất node/edge đã seed.
      await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
      await expect(
        page.getByText('51 khái niệm · 1 yếu · 1 chưa kiểm tra', { exact: true })
      ).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(51);
    } finally {
      // 6. Dọn dữ liệu P50/P51 độc lập qua user sau khi UI đã hoàn tất.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
