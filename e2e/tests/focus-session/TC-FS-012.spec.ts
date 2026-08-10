import { expect, test, type Page } from '@playwright/test';

import {
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

/** Gửi Page Visibility event rõ ràng vì browser headless không đổi `document.hidden` khi đổi tab. */
async function dispatchVisibility(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((nextHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: nextHidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: nextHidden ? 'hidden' : 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Chuyển sang tab phụ, mô phỏng Page Visibility một khoảng rồi quay lại đúng tab Focus. */
async function leaveAndReturn(focusPage: Page, otherPage: Page, awayMs: number): Promise<void> {
  await otherPage.bringToFront();
  await dispatchVisibility(focusPage, true);
  await otherPage.waitForTimeout(awayMs);
  await dispatchVisibility(focusPage, false);
  await focusPage.bringToFront();
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-012: Strict Mode tạm dừng khi rời tab và ghi nhận lần rời tab', () => {
  test('Hai lần visibilitychange đóng băng focused time và lưu awayCount = 2', async ({
    page,
    context,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_012');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    let otherPage: Page | null = null;

    try {
      // 1. Đăng nhập và tạo tab phụ trước khi mount phiên để việc mở tab không bị tính là rời.
      await loginViaUi(page, seed.user.email);
      otherPage = await context.newPage();
      await otherPage.goto('about:blank');
      await page.bringToFront();

      // 2. Mở Focus, xác minh Strict Mode mặc định bật rồi bắt đầu phiên C1.
      await page.goto('/focus');
      await expect(
        page.getByRole('switch', { name: 'Chế độ nghiêm ngặt', exact: true })
      ).toBeChecked();
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const countdown = page.getByRole('timer');
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await expect(countdown).toBeVisible();
      await expect(focusedTally).toBeVisible();

      // 3. Chạy T1 ít nhất 2 giây, ghi mốc rồi rời sang tab phụ trong P1 = 2,2 giây.
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(2);
      const focusedBeforeAway1 = await readClockSeconds(focusedTally);
      const remainingBeforeAway1 = await readClockSeconds(countdown);
      await leaveAndReturn(page, otherPage, 2_200);

      // 4. Quay lại phải thấy màn dừng; Student chủ động Tiếp tục và timer không nhảy qua P1.
      await expect(
        page.getByRole('heading', { name: 'Đồng hồ tập trung đã dừng', exact: true })
      ).toBeVisible();
      await expect(page.getByText(/Tổng trong phiên này:\s*1 lần/i)).toBeVisible();
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      const focusedAfterAway1 = await readClockSeconds(focusedTally);
      const remainingAfterAway1 = await readClockSeconds(countdown);
      expect(focusedAfterAway1 - focusedBeforeAway1).toBeGreaterThanOrEqual(0);
      expect(focusedAfterAway1 - focusedBeforeAway1).toBeLessThanOrEqual(1);
      expect(remainingBeforeAway1 - remainingAfterAway1).toBeGreaterThanOrEqual(0);
      expect(remainingBeforeAway1 - remainingAfterAway1).toBeLessThanOrEqual(1);

      // 5. Chạy T2 ít nhất 2 giây rồi lặp lại lần rời tab thứ hai trong P2 = 2,2 giây.
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(focusedAfterAway1 + 2);
      const focusedBeforeAway2 = await readClockSeconds(focusedTally);
      const remainingBeforeAway2 = await readClockSeconds(countdown);
      await leaveAndReturn(page, otherPage, 2_200);
      await expect(
        page.getByRole('heading', { name: 'Đồng hồ tập trung đã dừng', exact: true })
      ).toBeVisible();
      await expect(page.getByText(/Tổng trong phiên này:\s*2 lần/i)).toBeVisible();
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      const focusedAfterAway2 = await readClockSeconds(focusedTally);
      const remainingAfterAway2 = await readClockSeconds(countdown);
      expect(focusedAfterAway2 - focusedBeforeAway2).toBeGreaterThanOrEqual(0);
      expect(focusedAfterAway2 - focusedBeforeAway2).toBeLessThanOrEqual(1);
      expect(remainingBeforeAway2 - remainingAfterAway2).toBeGreaterThanOrEqual(0);
      expect(remainingBeforeAway2 - remainingAfterAway2).toBeLessThanOrEqual(1);

      // 6. Kết thúc phiên và xác minh summary hiển thị đúng hai lần rời tab.
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
      const awaySummary = page.getByText('Lần rời tab', { exact: true }).locator('..');
      const summarySeconds = await readClockSeconds(focusSummary);
      await expect(awaySummary).toContainText('2');

      // 7. DB chỉ có một phiên strict, awayCount = 2 và không tính ít nhất 4 giây vắng mặt.
      const sessions = await prisma.focusSession.findMany({
        where: { userId: seed.user.id },
        select: {
          status: true,
          conceptIds: true,
          strictMode: true,
          awayCount: true,
          focusedSeconds: true,
          startedAt: true,
          endedAt: true,
        },
      });
      expect(sessions).toHaveLength(1);
      const completed = sessions[0];
      if (!completed) throw new Error('Completed focus session was not persisted.');
      expect(completed.status).toBe('completed');
      expect(completed.conceptIds).toEqual([conceptC1.id]);
      expect(completed.strictMode).toBe(true);
      expect(completed.awayCount).toBe(2);
      expect(completed.focusedSeconds).toBe(summarySeconds);
      expect(completed.endedAt).not.toBeNull();
      const elapsedSeconds = Math.floor(
        ((completed.endedAt?.getTime() ?? 0) - completed.startedAt.getTime()) / 1_000
      );
      expect(elapsedSeconds - completed.focusedSeconds).toBeGreaterThanOrEqual(4);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
    } finally {
      // 8. Đóng tab phụ và cascade cleanup dữ liệu dù assertion visibility thất bại.
      await otherPage?.close().catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
