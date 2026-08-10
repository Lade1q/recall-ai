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

test.describe('TC-FS-009: Tạm dừng và tiếp tục phiên học', () => {
  test('Hai lần Pause/Resume giữ countdown và loại toàn bộ thời gian pause khỏi record', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_009');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Đăng nhập, bắt đầu Pomodoro C1 và lấy hai đồng hồ countdown/focused.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const countdown = page.getByRole('timer');
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      const announcement = page.locator('p[role="status"][aria-live="polite"]');
      await expect(countdown).toBeVisible();
      await expect(focusedTally).toBeVisible();
      const initialRemaining = await readClockSeconds(countdown);

      // 2. Chạy T1 ít nhất 2 giây rồi Pause lần thứ nhất.
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(2);
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
      await expect(announcement).toHaveText('Đã tạm dừng.');
      const remainingAfterT1 = await readClockSeconds(countdown);
      const focusedAfterT1 = await readClockSeconds(focusedTally);

      // 3. Giữ Pause P1 trong 2,2 giây; cả countdown và focused tally phải đứng yên.
      await page.waitForTimeout(2_200);
      expect(await readClockSeconds(countdown)).toBe(remainingAfterT1);
      expect(await readClockSeconds(focusedTally)).toBe(focusedAfterT1);

      // 4. Resume, chạy T2 ít nhất 2 giây và xác minh tiếp tục từ mốc cũ, không reset.
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      await expect(announcement).toHaveText('Đã tiếp tục.');
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(focusedAfterT1 + 2);
      const remainingAfterT2 = await readClockSeconds(countdown);
      expect(remainingAfterT2).toBeLessThan(remainingAfterT1);

      // 5. Pause lần hai trong P2 = 2,2 giây và kiểm tra trạng thái tiếp tục được giữ.
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(announcement).toHaveText('Đã tạm dừng.');
      const remainingAtSecondPause = await readClockSeconds(countdown);
      const focusedAtSecondPause = await readClockSeconds(focusedTally);
      await page.waitForTimeout(2_200);
      expect(await readClockSeconds(countdown)).toBe(remainingAtSecondPause);
      expect(await readClockSeconds(focusedTally)).toBe(focusedAtSecondPause);

      // 6. Resume lần hai, chạy T3 ít nhất 2 giây rồi kết thúc sớm khi timer đang chạy.
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await expect(announcement).toHaveText('Đã tiếp tục.');
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(focusedAtSecondPause + 2);
      const focusedBeforeEnd = await readClockSeconds(focusedTally);
      const remainingBeforeEnd = await readClockSeconds(countdown);
      expect(initialRemaining - remainingBeforeEnd).toBeGreaterThanOrEqual(6);
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();

      // 7. Tổng kết chỉ được lớn hơn tally trước click tối đa một giây do độ phân giải UI.
      const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
      const summarySeconds = await readClockSeconds(focusSummary);
      expect(summarySeconds).toBeGreaterThanOrEqual(focusedBeforeEnd);
      expect(summarySeconds).toBeLessThanOrEqual(focusedBeforeEnd + 1);

      // 8. DB chỉ có một record và focused time loại ít nhất hai khoảng pause đã đo.
      const sessions = await prisma.focusSession.findMany({
        where: { userId: seed.user.id },
        select: {
          status: true,
          conceptIds: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          focusedSeconds: true,
        },
      });
      expect(sessions).toHaveLength(1);
      const completed = sessions[0];
      if (!completed) throw new Error('Completed focus session was not persisted.');
      expect(completed.status).toBe('completed');
      expect(completed.conceptIds).toEqual([conceptC1.id]);
      expect(completed.focusedSeconds).toBe(summarySeconds);
      expect(completed.durationMinutes).toBe(Math.floor(summarySeconds / 60));
      expect(completed.endedAt).not.toBeNull();
      const elapsedSeconds = Math.floor(
        ((completed.endedAt?.getTime() ?? 0) - completed.startedAt.getTime()) / 1_000
      );
      expect(elapsedSeconds - completed.focusedSeconds).toBeGreaterThanOrEqual(4);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
    } finally {
      // 9. Cascade cleanup session, queue, concepts và plan bằng User gốc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
