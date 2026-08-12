import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

interface StartInterviewPayload {
  planId: string;
  conceptIds: string[];
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-008: Quan hệ graph và panel chi tiết khi click node', () => {
  test('Panel node hiển thị quan hệ/history đúng và CTA tạo Interview đúng concept', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_008', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) {
        throw new Error('Seed TC-DB-008 thiếu P1.');
      }

      // 1. Thay graph mặc định bằng A → B → C và D độc lập.
      await prisma.concept.deleteMany({ where: { planId: p1.id } });
      const [conceptA, conceptB, conceptC, conceptD] = await Promise.all([
        prisma.concept.create({
          data: { planId: p1.id, name: 'Concept A', masteryScore: 0.9 },
          select: { id: true },
        }),
        prisma.concept.create({
          data: {
            planId: p1.id,
            name: 'Concept B',
            masteryScore: 0.65,
            lastTestedAt: new Date(),
          },
          select: { id: true },
        }),
        prisma.concept.create({
          data: { planId: p1.id, name: 'Concept C', masteryScore: 0.4 },
          select: { id: true },
        }),
        prisma.concept.create({
          data: { planId: p1.id, name: 'Concept D', masteryScore: null },
          select: { id: true },
        }),
      ]);
      await prisma.conceptEdge.createMany({
        data: [
          { planId: p1.id, fromConceptId: conceptA.id, toConceptId: conceptB.id },
          { planId: p1.id, fromConceptId: conceptB.id, toConceptId: conceptC.id },
        ],
      });

      // 2. Seed lịch sử Interview/Focus thật cho B để panel tải từ endpoint chi tiết.
      const session = await prisma.interviewSession.create({
        data: {
          userId: seed.user.id,
          planId: p1.id,
          status: 'completed',
          conceptQueue: [conceptB.id],
          startedAt: new Date(Date.now() - 60 * 60 * 1000),
          endedAt: new Date(Date.now() - 30 * 60 * 1000),
        },
        select: { id: true },
      });
      await Promise.all([
        prisma.interviewTurn.create({
          data: {
            sessionId: session.id,
            conceptId: conceptB.id,
            turnIndex: 1,
            questionText: 'Câu hỏi kiểm tra B',
            answerText: 'Câu trả lời kiểm tra B',
            score: 0.65,
            feedback: 'Đạt mức đang học.',
            verdict: 'shallow',
            askedAt: new Date(Date.now() - 55 * 60 * 1000),
            answeredAt: new Date(Date.now() - 50 * 60 * 1000),
          },
        }),
        prisma.focusSession.create({
          data: {
            userId: seed.user.id,
            planId: p1.id,
            conceptIds: [conceptB.id],
            status: 'completed',
            durationMinutes: 25,
            focusedSeconds: 1500,
            startedAt: new Date(Date.now() - 25 * 60 * 1000),
            endedAt: new Date(Date.now() - 5 * 60 * 1000),
          },
        }),
      ]);

      // 3. Đăng nhập và mở graph đầy đủ của P1.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      await expect(page).toHaveURL(`/plan/${p1.id}`);

      // 4. Click B, chờ endpoint chi tiết thật và xác minh mastery, history, upstream/downstream.
      const nodeB = page.locator('.react-flow__node').filter({ hasText: 'Concept B' });
      const detailBResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/v1/plans/${p1.id}/concepts/${conceptB.id}` &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await nodeB.click();
      await detailBResponse;
      const panelB = page.locator('main aside').filter({
        has: page.getByRole('heading', { name: 'Concept B', exact: true }),
      });
      await expect(panelB).toContainText('Đang học');
      await expect(panelB).toContainText('Kiểm tra lần cuối');
      await expect(panelB).toContainText('0.65');
      await expect(panelB).toContainText('Khái niệm tiên quyết');
      await expect(panelB).toContainText('Concept A');
      await expect(panelB).toContainText('Khái niệm phụ thuộc');
      await expect(panelB).toContainText('Concept C');
      await expect(panelB).toContainText('Phiên kiểm tra');
      await expect(panelB).toContainText('Focus Session');

      // 5. Click D độc lập để xác minh panel được thay sạch, không giữ dữ liệu B.
      const nodeD = page.locator('.react-flow__node').filter({ hasText: 'Concept D' });
      const detailDResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/v1/plans/${p1.id}/concepts/${conceptD.id}` &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await nodeD.click();
      await detailDResponse;
      const panelD = page.locator('main aside').filter({
        has: page.getByRole('heading', { name: 'Concept D', exact: true }),
      });
      await expect(panelD).toContainText('Chưa kiểm tra lần nào');
      await expect(panelD).toContainText('Không có tiên quyết');
      await expect(panelD).toContainText('Không có khái niệm phụ thuộc');
      await expect(panelD).toContainText('Chưa có lịch sử học tập.');
      await expect(panelD).not.toContainText('Concept A');
      await expect(panelD).not.toContainText('Concept C');

      // 6. Click B rồi C liên tiếp để xác nhận state panel không giữ selection cũ.
      await nodeB.click();
      await expect(panelB).toBeVisible();
      const nodeC = page.locator('.react-flow__node').filter({ hasText: 'Concept C' });
      const detailCResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/v1/plans/${p1.id}/concepts/${conceptC.id}` &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await nodeC.click();
      await detailCResponse;
      const panelC = page.locator('main aside').filter({
        has: page.getByRole('heading', { name: 'Concept C', exact: true }),
      });
      await expect(panelC).toBeVisible();
      await expect(panelC).toContainText('Yếu');
      await expect(panelC).toContainText('Chưa kiểm tra lần nào');
      await expect(panelC).toContainText('Concept B');
      await expect(panelC).not.toContainText('Phiên kiểm tra');

      // 7. Quay lại B và kiểm tra CTA phát request tạo Interview với đúng plan/concept.
      await nodeB.click();
      await expect(panelB).toBeVisible();
      const startRequest = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === '/api/v1/interviews' && request.method() === 'POST'
      );
      const startResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/interviews' &&
          response.request().method() === 'POST' &&
          response.status() === 201
      );
      await panelB.getByRole('button', { name: 'Kiểm tra ngay', exact: true }).click();
      const request = await startRequest;
      const response = await startResponse;
      const payload = JSON.parse(request.postData() ?? '{}') as StartInterviewPayload;
      expect(payload).toEqual({ planId: p1.id, conceptIds: [conceptB.id] });
      expect(response.status()).toBe(201);
    } finally {
      // 8. Đợi mọi mutation đã assert xong rồi dọn dữ liệu theo user.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
