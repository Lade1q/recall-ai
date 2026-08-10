import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface CreatedFocusSession {
  id: string;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-013: Hủy phiên học giữa chừng', () => {
  test('Từ chối hủy giữ phiên; xác nhận hủy lưu audit cancelled nhưng không tính tiến độ', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_013');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Đăng nhập, bắt đầu phiên C1 và chạy đủ để có focused time khác 0.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedFocusSession>;
      const sessionId = startBody.data.id;
      const countdown = page.getByRole('timer');
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(2);
      // 2. Mở hộp Hủy lần đầu và chọn Quay lại phiên.
      const remainingBeforeDialog = await readClockSeconds(countdown);
      await page.getByRole('button', { name: 'Hủy phiên', exact: true }).click();
      const cancelDialog = page.getByRole('dialog', { name: 'Hủy phiên này?', exact: true });
      await expect(cancelDialog).toBeVisible();
      await expect(cancelDialog).toContainText('tập trung sẽ không được ghi vào lịch sử học tập');
      await cancelDialog.getByRole('button', { name: 'Quay lại phiên', exact: true }).click();
      await expect(cancelDialog).toHaveCount(0);

      // 3. Phiên vẫn chạy cùng record, countdown không reset và chưa có endedAt.
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      const remainingAfterReject = await readClockSeconds(countdown);
      expect(remainingAfterReject).toBeLessThanOrEqual(remainingBeforeDialog);
      const stillRunning = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true, endedAt: true },
      });
      expect(stillRunning).toEqual({ status: 'running', endedAt: null });
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);

      // 4. Mở lại hộp thoại và xác nhận Hủy phiên, chờ PATCH thật thành công.
      await page.getByRole('button', { name: 'Hủy phiên', exact: true }).click();
      const cancelResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
      );
      await cancelDialog.getByRole('button', { name: 'Hủy phiên', exact: true }).click();
      const cancelResponse = await cancelResponsePromise;
      expect(cancelResponse.status()).toBe(200);
      const cancelPayload = cancelResponse.request().postDataJSON() as {
        status: string;
        focusedSeconds: number;
        awayCount: number;
        pomodorosCompleted: number;
      };
      expect(cancelPayload).toEqual({
        status: 'cancelled',
        focusedSeconds: expect.any(Number),
        awayCount: 0,
        pomodorosCompleted: 0,
      });
      expect(cancelPayload.focusedSeconds).toBeGreaterThanOrEqual(2);

      // 5. UI quay về màn trước phiên, không hiển thị summary hoàn tất và có thể bắt đầu lại C1.
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Xong phiên học', exact: true })).toHaveCount(
        0
      );

      // 6. DB giữ record audit cancelled/raw seconds nhưng buộc duration học tập bằng 0.
      const cancelled = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          userId: true,
          conceptIds: true,
          status: true,
          focusedSeconds: true,
          durationMinutes: true,
          pomodorosCompleted: true,
          endedAt: true,
        },
      });
      expect(cancelled.userId).toBe(seed.user.id);
      expect(cancelled.conceptIds).toEqual([conceptC1.id]);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.focusedSeconds).toBe(cancelPayload.focusedSeconds);
      expect(cancelled.durationMinutes).toBe(0);
      expect(cancelled.pomodorosCompleted).toBe(0);
      expect(cancelled.endedAt).not.toBeNull();
      expect(
        await prisma.focusSession.count({
          where: { userId: seed.user.id, status: 'completed' },
        })
      ).toBe(0);

      // 7. Hủy không sửa SRE/review queue và snapshot khôi phục đã được xóa.
      const queueItems = await prisma.reviewQueueItem.findMany({
        where: { conceptId: conceptC1.id },
        select: { status: true },
      });
      expect(queueItems).not.toHaveLength(0);
      expect(queueItems.every((item) => item.status === 'pending')).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
    } finally {
      // 8. Cascade cleanup record audit, queue, concepts và plan bằng User gốc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
