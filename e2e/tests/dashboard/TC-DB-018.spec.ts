import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedStudentWithoutPlan,
} from '../focus-session/focus-session-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => prisma.$connect());
test.afterAll(async () => prisma.$disconnect());

test.describe('TC-DB-018: Cô lập dữ liệu Dashboard giữa Student', () => {
  test('Token của A không đọc được plan/graph/queue/session của B và đổi user không giữ cache', async ({
    page,
    request,
  }) => {
    const studentA = await seedStudentWithoutPlan(prisma, 'tc_db_018_a', 'Student A');
    const studentB = await seedStudentWithoutPlan(prisma, 'tc_db_018_b', 'Student B');

    try {
      // 1. Seed dữ liệu khác biệt và ID tài nguyên của hai Student.
      const [planA, planB] = await Promise.all([
        prisma.studyPlan.create({
          data: { userId: studentA.id, name: 'Plan chỉ Student A', status: 'active' },
          select: { id: true },
        }),
        prisma.studyPlan.create({
          data: { userId: studentB.id, name: 'Plan bí mật Student B', status: 'active' },
          select: { id: true },
        }),
      ]);
      const [conceptA, conceptB] = await Promise.all([
        prisma.concept.create({
          data: { planId: planA.id, name: 'Concept riêng A', masteryScore: 0.8 },
          select: { id: true },
        }),
        prisma.concept.create({
          data: { planId: planB.id, name: 'Concept bí mật B', masteryScore: 0.2 },
          select: { id: true },
        }),
      ]);
      const queueB = await prisma.reviewQueueItem.create({
        data: {
          planId: planB.id,
          conceptId: conceptB.id,
          priority: 10,
          reason: 'manual',
          scheduledFor: new Date(Date.now() - 60_000),
        },
        select: { id: true },
      });
      const sessionB = await prisma.focusSession.create({
        data: {
          userId: studentB.id,
          planId: planB.id,
          conceptIds: [conceptB.id],
          status: 'completed',
          durationMinutes: 90,
          focusedSeconds: 5400,
          startedAt: new Date(),
          endedAt: new Date(),
        },
        select: { id: true },
      });

      // 2. Đăng nhập A và xác minh UI/API chỉ chứa tài nguyên của A.
      await loginViaUi(page, studentA.email);
      await page.goto('/dashboard');
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan chỉ Student A', exact: true })
      ).toBeVisible();
      await expect(page.getByText('Plan bí mật Student B', { exact: true })).toHaveCount(0);
      const tokenA = await page.evaluate(() => localStorage.getItem('access_token'));
      expect(tokenA).toBeTruthy();
      const plansA = await request.get(`${API_BASE_URL}/api/v1/plans`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(plansA.status()).toBe(200);
      await expect(plansA.json()).resolves.toMatchObject({
        success: true,
        data: expect.arrayContaining([expect.objectContaining({ id: planA.id })]),
      });
      const plansABody = (await plansA.json().catch(() => null)) as unknown;
      expect(JSON.stringify(plansABody)).not.toContain(planB.id);

      // 3. Dùng token A truy cập thẳng resource của B: không được lộ metadata.
      for (const path of [
        `/api/v1/plans/${planB.id}`,
        `/api/v1/plans/${planB.id}/concepts/${conceptB.id}`,
        `/api/v1/focus-sessions/${sessionB.id}`,
        `/api/v1/review-queue/${queueB.id}`,
      ]) {
        const response = await request.get(`${API_BASE_URL}${path}`, {
          headers: { Authorization: `Bearer ${tokenA}` },
        });
        expect([403, 404]).toContain(response.status());
        expect(JSON.stringify(await response.json())).not.toContain('bí mật Student B');
      }

      // 4. Đăng xuất/đăng nhập B cùng browser, rồi kiểm tra UI không giữ dữ liệu A.
      await page.evaluate(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      });
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
      await loginViaUi(page, studentB.email);
      await page.goto('/dashboard');
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan bí mật Student B', exact: true })
      ).toBeVisible();
      await expect(page.getByText('Plan chỉ Student A', { exact: true })).toHaveCount(0);
    } finally {
      // 5. Xóa cả hai user sau khi hoàn tất các request kiểm quyền.
      await prisma.user.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
    }
  });
});
