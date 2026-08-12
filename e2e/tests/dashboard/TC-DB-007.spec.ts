import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

const boundaryConcepts = [
  { name: 'Concept Null', score: null, band: 'untested' },
  { name: 'Concept Zero', score: 0, band: 'weak' },
  { name: 'Concept Weak Edge', score: 0.599, band: 'weak' },
  { name: 'Concept Learning Edge', score: 0.6, band: 'learning' },
  { name: 'Concept Learning High', score: 0.799, band: 'learning' },
  { name: 'Concept Strong Edge', score: 0.8, band: 'strong' },
  { name: 'Concept Perfect', score: 1, band: 'strong' },
] as const;

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-007: Màu node theo mastery_score tại mọi ngưỡng biên', () => {
  test('Mini graph và graph đầy đủ dùng cùng dải untested/weak/learning/strong', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_007', { emptyQueue: true });

    try {
      const [p1] = seed.plans;
      if (!p1) {
        throw new Error('Seed TC-DB-007 thiếu P1.');
      }

      // 1. Thay concept mặc định bằng bảy giá trị ngay tại các ngưỡng hiển thị.
      await prisma.concept.deleteMany({ where: { planId: p1.id } });
      await prisma.concept.createMany({
        data: boundaryConcepts.map((concept) => ({
          planId: p1.id,
          name: concept.name,
          masteryScore: concept.score,
        })),
      });

      // 2. Đăng nhập Dashboard và kiểm tra semantic data-band của từng node mini graph.
      await loginViaUi(page, seed.user.email);
      const miniGraph = page
        .getByRole('heading', { name: 'Đồ thị khái niệm', exact: true })
        .locator('xpath=ancestor::section[1]');
      for (const concept of boundaryConcepts) {
        await expect(
          miniGraph
            .locator(`.react-flow__node [data-slot="concept-node"][data-band="${concept.band}"]`)
            .filter({ hasText: concept.name })
        ).toBeVisible();
      }

      // 3. Mở graph đầy đủ của cùng plan và đối chiếu chính các dải semantic đó.
      await page.goto(`/plan/${p1.id}`);
      await expect(page).toHaveURL(`/plan/${p1.id}`);
      for (const concept of boundaryConcepts) {
        await expect(
          page
            .locator(`.react-flow__node [data-slot="concept-node"][data-band="${concept.band}"]`)
            .filter({ hasText: concept.name })
        ).toBeVisible();
      }

      // 4. Đổi score 0 → 0.6, reload graph đầy đủ và xác minh node chuyển weak sang learning.
      const updateResult = await prisma.concept.updateMany({
        where: { planId: p1.id, name: 'Concept Zero' },
        data: { masteryScore: 0.6 },
      });
      expect(updateResult.count).toBe(1);
      await page.reload();
      await expect(
        page
          .locator('.react-flow__node [data-slot="concept-node"][data-band="learning"]')
          .filter({ hasText: 'Concept Zero' })
      ).toBeVisible();

      // 5. Quay lại Dashboard để xác minh mini graph cũng đọc lại cùng ngưỡng sau thay đổi.
      await page.goto('/dashboard');
      await expect(
        miniGraph
          .locator('.react-flow__node [data-slot="concept-node"][data-band="learning"]')
          .filter({ hasText: 'Concept Zero' })
      ).toBeVisible();
    } finally {
      // 6. Cascade theo user dọn toàn bộ graph và dữ liệu session đã seed.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
