import { expect, test, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-007: Hết chu kỳ tự nhiên rồi xác nhận hoàn tất', () => {
  test('Hết lượt tự nhiên: chỉ hoàn tất một lần, tổng kết khớp DB và không đổi mastery', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_007');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const originalLastTestedAt = new Date('2026-07-01T03:00:00.000Z');
    const completionRequests: Request[] = [];
    let captureCompletionRequest: ((request: Request) => void) | null = null;

    try {
      // 1. Đặt một lượt test 1 phút và neo mastery/lastTested để phát hiện mọi side effect của Focus.
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
      await prisma.concept.update({
        where: { id: conceptC1.id },
        data: { masteryScore: 0.37, lastTestedAt: originalLastTestedAt },
      });
      const conceptBefore = await prisma.concept.findUniqueOrThrow({
        where: { id: conceptC1.id },
        select: { masteryScore: true, lastTestedAt: true },
      });

      // 2. Cài clock ảo trước khi mở app, đăng nhập và bắt đầu phiên Pomodoro C1.
      await loginViaUi(page, seed.user.email);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 60_000));
      await page.goto(`/focus?planId=${seed.plan.id}&conceptId=${conceptC1.id}`);
      await expect(page.getByText('01:00', { exact: true })).toBeVisible();
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
      await expect(page.getByRole('timer')).toBeVisible();
      const sessionId = startBody.data.id;

      // 3. Đếm mutation completion theo đúng ID từ response; listener được gắn trước khi hết lượt.
      captureCompletionRequest = (request: Request) => {
        if (
          request.method() === 'PATCH' &&
          request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
        ) {
          completionRequests.push(request);
        }
      };
      page.on('request', captureCompletionRequest);

      // 4. Backdate mốc DB để server chấp nhận 60 giây focused do clock trình duyệt tăng tốc.
      await prisma.focusSession.update({
        where: { id: sessionId },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });

      // 5. Không thao tác Kết thúc sớm; để lượt work tự chạm mốc 0 và tự chuyển sang nghỉ dài.
      await page.clock.runFor(60_000);

      // 6. Ranh giới tự nhiên phải tăng Pomodoro nhưng chưa tự gửi mutation vì product hiện yêu
      // cầu xác nhận ở màn nghỉ; đây không phải nhánh Kết thúc sớm của TC-FS-008.
      await expect(page.getByRole('heading', { name: 'Nghỉ dài', exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('Hết lượt cuối — vào giờ nghỉ dài.');
      await expect(page.getByText(/-\d{2}:\d{2}/)).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Kết thúc phiên học', exact: true })
      ).toBeVisible();
      const beforeConfirmation = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true, endedAt: true, pomodorosCompleted: true },
      });
      expect(beforeConfirmation.status).toBe('running');
      expect(beforeConfirmation.endedAt).toBeNull();
      expect(beforeConfirmation.pomodorosCompleted).toBe(0);
      expect(completionRequests).toHaveLength(0);

      // 7. Xác nhận ở màn nghỉ và chờ đúng một PATCH completion thật hoàn tất.
      const endResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      expect((await endResponsePromise).status()).toBe(200);

      // 8. Tổng kết phải hiển thị và đưa ra bước tiếp theo sang AI Examiner/Interview.
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Bắt đầu kiểm tra', exact: true })).toBeVisible();

      // 9. Đối chiếu record authoritative: đủ owner/concept/mốc giờ và ba số liệu tổng kết.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          userId: true,
          conceptIds: true,
          status: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          focusedSeconds: true,
          awayCount: true,
          pomodorosCompleted: true,
        },
      });
      expect(completed.userId).toBe(seed.user.id);
      expect(completed.conceptIds).toEqual([conceptC1.id]);
      expect(completed.status).toBe('completed');
      expect(completed.endedAt).not.toBeNull();
      expect(completed.endedAt?.getTime()).toBeGreaterThan(completed.startedAt.getTime());
      expect(completed.durationMinutes).toBe(1);
      expect(completed.focusedSeconds).toBe(60);
      expect(completed.awayCount).toBe(0);
      expect(completed.pomodorosCompleted).toBe(1);
      expect(completed.durationMinutes).toBe(Math.floor(completed.focusedSeconds / 60));

      // 10. Ba ô summary phải lấy đúng số liệu đã persist, không dựa vào expected hard-code riêng.
      const focusedSummaryValue = page
        .getByText('Tập trung', { exact: true })
        .locator('..')
        .locator(':scope > div')
        .first();
      const pomodoroSummaryValue = page
        .getByText('Pomodoro', { exact: true })
        .locator('..')
        .locator(':scope > div')
        .first();
      const awaySummaryValue = page
        .getByText('Lần rời tab', { exact: true })
        .locator('..')
        .locator(':scope > div')
        .first();
      expect(await readClockSeconds(focusedSummaryValue)).toBe(completed.focusedSeconds);
      await expect(pomodoroSummaryValue).toHaveText(`${completed.pomodorosCompleted}/1`);
      await expect(awaySummaryValue).toHaveText(String(completed.awayCount));

      // 11. Chỉ một completion request được phát và payload của nó khớp record cuối cùng.
      expect(completionRequests).toHaveLength(1);
      expect(completionRequests[0]?.postDataJSON()).toEqual({
        status: 'completed',
        focusedSeconds: completed.focusedSeconds,
        awayCount: completed.awayCount,
        pomodorosCompleted: completed.pomodorosCompleted,
      });

      // 12. Focus chỉ ghi thời gian: masteryScore và lastTestedAt của C1 phải bất biến.
      expect(
        await prisma.concept.findUniqueOrThrow({
          where: { id: conceptC1.id },
          select: { masteryScore: true, lastTestedAt: true },
        })
      ).toEqual(conceptBefore);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
    } finally {
      // 13. Luôn tháo listener và cascade cleanup session, queue, concepts và plan từ User gốc.
      if (captureCompletionRequest) page.off('request', captureCompletionRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
