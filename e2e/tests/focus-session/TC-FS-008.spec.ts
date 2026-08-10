import { expect, test } from '@playwright/test';

import {
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-008: Kết thúc phiên Pomodoro sớm', () => {
  test('Kết thúc sau khoảng 10 giây chỉ lưu thời gian tập trung thực tế', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_008');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Đăng nhập, mở Focus và bắt đầu Pomodoro mặc định 25 phút cho C1.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await expect(page.getByText('25:00', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const timer = page.getByRole('timer');
      await expect(timer).toBeVisible();
      const initialRemaining = await readClockSeconds(timer);

      // 2. Để timer chạy thật khoảng 10 giây và xác minh chưa thể bị coi là đủ 25 phút.
      await page.waitForTimeout(10_200);
      const remainingBeforeEnd = await readClockSeconds(timer);
      const observedSeconds = initialRemaining - remainingBeforeEnd;
      expect(observedSeconds).toBeGreaterThanOrEqual(9);
      expect(observedSeconds).toBeLessThanOrEqual(12);

      // 3. Nhấn Kết thúc phiên học và chờ request PATCH thật thành công.
      const sessionBeforeEnd = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: { id: true },
      });
      const endResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().endsWith(`/api/v1/focus-sessions/${sessionBeforeEnd.id}`)
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      expect((await endResponsePromise).status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();

      // 4. Tổng kết phải hiển thị số giây thực tế, không tự gán đủ 25 phút.
      const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
      const summarySeconds = await readClockSeconds(focusSummary);
      expect(summarySeconds).toBeGreaterThanOrEqual(9);
      expect(summarySeconds).toBeLessThanOrEqual(12);
      expect(summarySeconds).toBeLessThan(25 * 60);

      // 5. Đối chiếu DB: hoàn tất đúng owner/C1, phút nguyên làm tròn xuống và thời gian hợp lệ.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionBeforeEnd.id },
        select: {
          userId: true,
          conceptIds: true,
          status: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          focusedSeconds: true,
          pomodorosCompleted: true,
        },
      });
      expect(completed.userId).toBe(seed.user.id);
      expect(completed.conceptIds).toEqual([conceptC1.id]);
      expect(completed.status).toBe('completed');
      expect(completed.endedAt).not.toBeNull();
      expect(completed.focusedSeconds).toBe(summarySeconds);
      expect(completed.durationMinutes).toBe(Math.floor(summarySeconds / 60));
      expect(completed.durationMinutes).toBe(0);
      expect(completed.pomodorosCompleted).toBe(0);
      const elapsedSeconds = Math.floor(
        ((completed.endedAt?.getTime() ?? 0) - completed.startedAt.getTime()) / 1_000
      );
      expect(elapsedSeconds).toBeGreaterThanOrEqual(completed.focusedSeconds);
      expect(elapsedSeconds - completed.focusedSeconds).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();

      // 6. Sau khi hoàn tất, summary và DB phải đứng yên, không tiếp tục cộng timer nền.
      await page.waitForTimeout(1_200);
      expect(await readClockSeconds(focusSummary)).toBe(summarySeconds);
      const stableRecord = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionBeforeEnd.id },
        select: { focusedSeconds: true, durationMinutes: true, endedAt: true },
      });
      expect(stableRecord).toEqual({
        focusedSeconds: completed.focusedSeconds,
        durationMinutes: completed.durationMinutes,
        endedAt: completed.endedAt,
      });
    } finally {
      // 7. Cascade cleanup session, queue, concepts và plan bằng User gốc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
