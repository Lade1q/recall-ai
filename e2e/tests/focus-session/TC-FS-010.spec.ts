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

test.describe('TC-FS-010: Thực hiện Free Timer', () => {
  test('Free Timer vượt mốc Pomodoro và chỉ hoàn tất khi Student chủ động kết thúc', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_010');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Rút ngắn mốc đối chứng Pomodoro còn 1 phút và cài clock ảo trước khi mở app.
      await prisma.user.update({
        where: { id: seed.user.id },
        data: {
          pomodoroConfig: {
            work: 1,
            short_break: 1,
            long_break: 1,
            cycles: 1,
            sound: false,
          },
        },
      });
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');

      // 2. Chọn phương pháp Không giới hạn thời gian bằng control truy cập được trên màn thiết lập.
      const freeTimerName = /^(Không giới hạn thời gian|Free Timer)$/i;
      const freeTimerOption = page
        .getByRole('radio', { name: freeTimerName })
        .or(page.getByRole('button', { name: freeTimerName }))
        .or(page.getByRole('tab', { name: freeTimerName }))
        .first();
      await expect(
        freeTimerOption,
        'Màn thiết lập chưa có control chọn “Không giới hạn thời gian” / Free Timer.'
      ).toBeVisible();
      await freeTimerOption.click();

      // 3. Bắt đầu Free Timer và lấy record/tally đang chạy cho C1.
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const timer = page.getByRole('timer');
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await expect(timer).toBeVisible();
      await expect(focusedTally).toBeVisible();
      const session = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: { id: true },
      });

      // 4. Backdate DB để server chấp nhận thời gian clock ảo khi kết thúc sau hơn một phút.
      await prisma.focusSession.update({
        where: { id: session.id },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });

      // 5. Vượt mốc Pomodoro test 1 phút; Free Timer vẫn phải chạy và chưa tự hoàn tất.
      await page.clock.runFor(61_000);
      expect(await readClockSeconds(focusedTally)).toBeGreaterThanOrEqual(60);
      await expect(
        page.getByRole('button', { name: 'Kết thúc phiên học', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Xong phiên học', exact: true })).toHaveCount(
        0
      );
      const runningRecord = await prisma.focusSession.findUniqueOrThrow({
        where: { id: session.id },
        select: { status: true, endedAt: true },
      });
      expect(runningRecord).toEqual({ status: 'running', endedAt: null });

      // 6. Pause/Resume vẫn áp dụng: cả timer và focused tally đứng yên trong lúc pause.
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      const timerAtPause = await readClockSeconds(timer);
      const focusedAtPause = await readClockSeconds(focusedTally);
      await page.clock.runFor(5_000);
      expect(await readClockSeconds(timer)).toBe(timerAtPause);
      expect(await readClockSeconds(focusedTally)).toBe(focusedAtPause);
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await page.clock.runFor(1_000);
      expect(await readClockSeconds(focusedTally)).toBeGreaterThan(focusedAtPause);

      // 7. Chỉ thao tác Kết thúc của Student mới hoàn tất phiên và mở summary.
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
      const summarySeconds = await readClockSeconds(focusSummary);
      expect(summarySeconds).toBeGreaterThanOrEqual(61);

      // 8. DB lưu thời gian thực tế, đúng concept và không tự ghi Pomodoro hoàn tất.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: session.id },
        select: {
          status: true,
          conceptIds: true,
          focusedSeconds: true,
          durationMinutes: true,
          pomodorosCompleted: true,
          endedAt: true,
        },
      });
      expect(completed.status).toBe('completed');
      expect(completed.conceptIds).toEqual([conceptC1.id]);
      expect(completed.focusedSeconds).toBe(summarySeconds);
      expect(completed.durationMinutes).toBe(Math.floor(summarySeconds / 60));
      expect(completed.pomodorosCompleted).toBe(0);
      expect(completed.endedAt).not.toBeNull();
    } finally {
      // 9. Cascade cleanup mọi dữ liệu test dù Free Timer chưa được triển khai.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
