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

test.describe('TC-DB-011: Graph chưa có Interview', () => {
  test('Focus không làm đổi mastery, còn Interview có score đổi đúng node sang đang học', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_011', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-011 thiếu P1.');

      // 1. Tạo graph toàn null, có edge thật và Focus completed nhưng chưa có Interview.
      await prisma.concept.deleteMany({ where: { planId: p1.id } });
      const [conceptA, conceptB, conceptC] = await Promise.all([
        prisma.concept.create({
          data: { planId: p1.id, name: 'Concept A', masteryScore: null },
          select: { id: true },
        }),
        prisma.concept.create({
          data: { planId: p1.id, name: 'Concept B', masteryScore: null },
          select: { id: true },
        }),
        prisma.concept.create({
          data: { planId: p1.id, name: 'Concept C', masteryScore: null },
          select: { id: true },
        }),
      ]);
      await prisma.conceptEdge.create({
        data: { planId: p1.id, fromConceptId: conceptA.id, toConceptId: conceptB.id },
      });
      await prisma.focusSession.create({
        data: {
          userId: seed.user.id,
          planId: p1.id,
          conceptIds: [conceptA.id],
          status: 'completed',
          durationMinutes: 25,
          focusedSeconds: 1500,
          startedAt: new Date(Date.now() - 30 * 60 * 1000),
          endedAt: new Date(),
        },
      });

      // 2. Mở graph: toàn bộ node phải là untested dù đã có Focus Session.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      await expect(page.locator('[data-slot="concept-node"][data-band="untested"]')).toHaveCount(3);
      await expect(page.getByText('Chưa đo được gì', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Kiểm tra 2 khái niệm gốc', exact: true })
      ).toBeVisible();

      // 3. Hover node để xác minh tooltip phản ánh đúng việc chưa có lần kiểm tra.
      const nodeA = page.locator('.react-flow__node').filter({ hasText: 'Concept A' });
      await nodeA.hover();
      await expect(page.locator('.react-flow__node-toolbar')).toContainText('chưa kiểm tra');

      // 4. Ghi nhận một Interview completed có turn/score thật cho A và cập nhật mastery kết quả.
      const session = await prisma.interviewSession.create({
        data: {
          userId: seed.user.id,
          planId: p1.id,
          status: 'completed',
          conceptQueue: [conceptA.id],
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
          endedAt: new Date(),
        },
        select: { id: true },
      });
      await Promise.all([
        prisma.interviewTurn.create({
          data: {
            sessionId: session.id,
            conceptId: conceptA.id,
            turnIndex: 1,
            questionText: 'Câu hỏi A',
            answerText: 'Câu trả lời A',
            score: 0.65,
            feedback: 'Đang học.',
            verdict: 'shallow',
            askedAt: new Date(Date.now() - 9 * 60 * 1000),
            answeredAt: new Date(Date.now() - 8 * 60 * 1000),
          },
        }),
        prisma.concept.update({
          where: { id: conceptA.id },
          data: { masteryScore: 0.65, lastTestedAt: new Date() },
        }),
      ]);

      // 5. Reload để graph đọc kết quả Interview: chỉ A chuyển band, B/C vẫn untested.
      await page.reload();
      const learningA = page.locator('.react-flow__node').filter({ hasText: 'Concept A' });
      await expect(learningA.locator('[data-slot="concept-node"]')).toHaveAttribute(
        'data-band',
        'learning'
      );
      await expect(page.locator('[data-slot="concept-node"][data-band="untested"]')).toHaveCount(2);
      await expect(page.getByText('Chưa đo được gì', { exact: true })).toHaveCount(0);
    } finally {
      // 6. Xóa trọn bộ graph/session qua user để worker khác không nhìn thấy dữ liệu này.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
