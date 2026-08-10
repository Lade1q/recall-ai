import { expect, test } from '@playwright/test';

import { createTestPrismaClient, loginViaUi, seedFocusPlan } from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const savedNote = 'Ghi chú đã auto-save trước khi Pomodoro kết thúc';

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-007: Tự động hoàn tất khi Pomodoro hết giờ', () => {
  test('Hết timer test 1 phút: báo trực quan, xác nhận kết thúc, lưu record/note và hiện tổng kết', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_007');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Đặt cấu hình test ngắn 1 phút/1 lượt trực tiếp trên user; tắt âm để kiểm tra kênh visual.
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

      // 2. Cài clock ảo trước khi mở app, đăng nhập và bắt đầu phiên Pomodoro C1.
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await expect(page.getByText('01:00', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      await expect(page.getByRole('timer')).toBeVisible();
      const session = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: { id: true },
      });

      // 3. Backdate mốc DB để server chấp nhận 60 giây focused do clock trình duyệt tăng tốc.
      await prisma.focusSession.update({
        where: { id: session.id },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });

      // 4. Nhập ghi chú và tăng clock qua debounce 800ms, chờ server xác nhận đã auto-save.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const noteInput = page.getByLabel('Ghi chú cho khái niệm Concept C1', { exact: true });
      const noteResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith(`/api/v1/focus-sessions/${session.id}/notes`)
      );
      await noteInput.fill(savedNote);
      await page.clock.runFor(900);
      expect((await noteResponsePromise).status()).toBe(201);
      await expect(page.getByRole('complementary').getByRole('status')).toHaveText(/^Đã lưu/);
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();

      // 5. Không nhấn Kết thúc sớm; tăng clock tới khi lượt work tự chạm mốc 0.
      await page.clock.runFor(60_000);

      // 6. Hệ thống phải báo trực quan, không hiển thị số âm và đưa ra thao tác xác nhận kết thúc.
      await expect(page.getByRole('heading', { name: 'Nghỉ dài', exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('Hết lượt cuối — vào giờ nghỉ dài.');
      await expect(page.getByText(/-\d{2}:\d{2}/)).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Kết thúc phiên học', exact: true })
      ).toBeVisible();
      const beforeConfirmation = await prisma.focusSession.findUniqueOrThrow({
        where: { id: session.id },
        select: { status: true, endedAt: true },
      });
      expect(beforeConfirmation.status).toBe('running');
      expect(beforeConfirmation.endedAt).toBeNull();

      // 7. Xác nhận Kết thúc phiên học và chờ PATCH thật hoàn tất.
      const endResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().endsWith(`/api/v1/focus-sessions/${session.id}`)
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      expect((await endResponsePromise).status()).toBe(200);

      // 8. Tổng kết phải hiển thị và đưa ra bước tiếp theo sang AI Examiner/Interview.
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Bắt đầu kiểm tra', exact: true })).toBeVisible();
      await expect(page.getByText('01:00', { exact: true })).toBeVisible();
      await expect(page.getByText('1/1', { exact: true })).toBeVisible();

      // 9. Đối chiếu record và ghi chú: đủ owner/concept/mốc thời gian/1 phút, không mất note.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: session.id },
        select: {
          userId: true,
          conceptIds: true,
          status: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          focusedSeconds: true,
          pomodorosCompleted: true,
          notes: { select: { conceptId: true, body: true } },
        },
      });
      expect(completed.userId).toBe(seed.user.id);
      expect(completed.conceptIds).toEqual([conceptC1.id]);
      expect(completed.status).toBe('completed');
      expect(completed.endedAt).not.toBeNull();
      expect(completed.endedAt?.getTime()).toBeGreaterThan(completed.startedAt.getTime());
      expect(completed.durationMinutes).toBe(1);
      expect(completed.focusedSeconds).toBe(60);
      expect(completed.pomodorosCompleted).toBe(1);
      expect(completed.notes).toEqual([{ conceptId: conceptC1.id, body: savedNote }]);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
    } finally {
      // 10. Cascade cleanup record, note, queue, concepts và plan bằng User gốc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
