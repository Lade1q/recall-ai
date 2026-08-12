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

test.describe('TC-DB-032: Chuyển plan đang xem graph', () => {
  test('Đổi giữa P1, P2 và P_empty không giữ node, edge hay panel của plan trước', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_032', {
      hasP2: true,
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1, p2] = seed.plans;
      if (!p1 || !p2) throw new Error('Seed TC-DB-032 thiếu P1 hoặc P2.');
      const p2Root = await prisma.concept.findFirstOrThrow({
        where: { planId: p2.id },
        select: { id: true },
      });
      const [p2c2, p2c3, p2c4, p2c5] = await Promise.all(
        ['P2 C2', 'P2 C3', 'P2 C4', 'P2 C5'].map((name) =>
          prisma.concept.create({ data: { planId: p2.id, name }, select: { id: true } })
        )
      );
      if (!p2c2 || !p2c3 || !p2c4 || !p2c5) throw new Error('Seed TC-DB-032 thiếu node P2.');
      await prisma.conceptEdge.createMany({
        data: [
          { planId: p2.id, fromConceptId: p2Root.id, toConceptId: p2c2.id },
          { planId: p2.id, fromConceptId: p2c2.id, toConceptId: p2c3.id },
          { planId: p2.id, fromConceptId: p2c3.id, toConceptId: p2c4.id },
          { planId: p2.id, fromConceptId: p2c4.id, toConceptId: p2c5.id },
        ],
      });
      const pEmpty = await prisma.studyPlan.create({
        data: { userId: seed.user.id, name: 'Plan Empty', status: 'active' },
        select: { id: true },
      });

      // 1. Đăng nhập, mở P1 và chọn C2 để panel đang mở là state cần được dọn khi đổi plan.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      const p1C2 = page.locator('.react-flow__node').filter({ hasText: 'Concept C2' });
      const p1DetailResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.includes(`/api/v1/plans/${p1.id}/concepts/`) &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await p1C2.click();
      await p1DetailResponse;
      await expect(
        page.locator('main aside').filter({
          has: page.getByRole('heading', { name: 'Concept C2', exact: true }),
        })
      ).toBeVisible();

      // 2. Chuyển P1 sang P2 qua plan switcher và chờ URL/graph P2 đã render.
      const switcher = page.getByLabel('Kế hoạch', { exact: true });
      const p2Url = page.waitForURL(`/plan/${p2.id}`);
      await switcher.selectOption(p2.id);
      await p2Url;
      await expect(page.locator('.react-flow__node')).toHaveCount(5);
      await expect(page.locator('.react-flow__edge')).toHaveCount(4);
      await expect(page.getByText('P2 C5', { exact: true })).toBeVisible();
      await expect(page.getByText('Concept C2', { exact: true })).toHaveCount(0);
      await expect(page.locator('main aside')).toHaveCount(0);

      // 3. Chuyển lại P1, xác nhận graph nhỏ hơn không còn node/edge của P2.
      const p1Url = page.waitForURL(`/plan/${p1.id}`);
      await switcher.selectOption(p1.id);
      await p1Url;
      await expect(page.locator('.react-flow__node')).toHaveCount(3);
      await expect(page.locator('.react-flow__edge')).toHaveCount(1);
      await expect(page.getByText('P2 C5', { exact: true })).toHaveCount(0);

      // 4. Chuyển sang P_empty để xác nhận graph rỗng có state riêng và không crash.
      const emptyUrl = page.waitForURL(`/plan/${pEmpty.id}`);
      await switcher.selectOption(pEmpty.id);
      await emptyUrl;
      await expect(page.locator('.react-flow__node')).toHaveCount(0);
      await expect(
        page.getByText('Chưa có khái niệm nào trong đồ thị.', { exact: true })
      ).toBeVisible();
    } finally {
      // 5. Dọn Student độc lập để cascade toàn bộ P1, P2, P_empty và cạnh đã seed.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
