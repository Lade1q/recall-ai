import { expect, test, type Page } from '@playwright/test';

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

interface CompletionPayload {
  status: 'completed';
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
}

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

/** Ưu tiên trạng thái thật; luôn phát event bảo hiểm vì headless có thể đổi state mà thiếu event. */
async function ensureVisibility(page: Page, hidden: boolean): Promise<void> {
  const nativeStateMatches = await page.evaluate(
    (expectedHidden) => document.hidden === expectedHidden,
    hidden
  );
  if (!nativeStateMatches) {
    await dispatchVisibility(page, hidden);
    return;
  }
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

/** Chuyển tab thật, giữ trạng thái away bằng clock ảo rồi quay lại đúng tab Focus. */
async function leaveAndReturn(focusPage: Page, otherPage: Page, awayMs: number): Promise<void> {
  await otherPage.bringToFront();
  await ensureVisibility(focusPage, true);
  await focusPage.clock.runFor(awayMs);
  await focusPage.bringToFront();
  await ensureVisibility(focusPage, false);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-012: Strict Mode tạm dừng khi rời tab và ghi nhận lần rời tab', () => {
  for (const scenario of [
    { key: 'a', label: 'rời tab một lần', awayCount: 1 },
    { key: 'b', label: 'rời tab hai lần', awayCount: 2 },
  ] as const) {
    test(`${scenario.key}) ${scenario.label}: đóng băng timer và lưu đúng awayCount`, async ({
      page,
      context,
    }) => {
      const seed = await seedFocusPlan(prisma, `tc_fs_012_${scenario.key}`);
      const conceptC1 = seed.concepts[0];
      if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
      let otherPage: Page | null = null;

      try {
        // 1. Đăng nhập, rồi đóng băng clock và tạo tab phụ trước phiên để setup không bị tính away.
        await loginViaUi(page, seed.user.email);
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now() + 60_000));
        otherPage = await context.newPage();
        await otherPage.goto('about:blank');
        await page.bringToFront();

        // 2. Strict Mode phải bật trước Start; lấy session ID từ response tạo thật.
        await page.goto('/focus');
        const strictSwitch = page.getByRole('switch', {
          name: 'Chế độ nghiêm ngặt',
          exact: true,
        });
        await expect(strictSwitch).toBeChecked();
        const createResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
        );
        await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);
        const created = (await createResponse.json()) as ApiEnvelope<CreatedSession>;
        const sessionId = created.data.id;

        // 3. Panel giữa phiên chỉ hiển thị trạng thái Strict bị khóa, không còn switch chỉnh sửa.
        await page.getByRole('button', { name: 'Cấu hình Pomodoro', exact: true }).click();
        const runningDialog = page.getByRole('dialog', {
          name: 'Cấu hình Pomodoro',
          exact: true,
        });
        await expect(
          runningDialog.getByText('Chế độ nghiêm ngặt đang bật, giữ nguyên cho tới hết phiên.', {
            exact: true,
          })
        ).toBeVisible();
        await expect(
          runningDialog.getByRole('switch', {
            name: 'Chế độ nghiêm ngặt',
            exact: true,
          })
        ).toHaveCount(0);
        await runningDialog.getByRole('button', { name: 'Đóng', exact: true }).click();

        // 4. Backdate chỉ record test vì clock trình duyệt được tăng tốc còn backend dùng giờ thật.
        await prisma.focusSession.update({
          where: { id: sessionId },
          data: { startedAt: new Date(Date.now() - 5 * 60 * 1_000) },
        });
        const countdown = page.getByRole('timer');
        const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
        await expect(countdown).toBeVisible();
        await expect(focusedTally).toBeVisible();
        const virtualStartedAt = await page.evaluate(() => Date.now());

        // 5. Mỗi vòng chạy 2 giây focused rồi rời đúng 3 giây; cả hai đồng hồ phải đứng yên.
        for (let awayIndex = 1; awayIndex <= scenario.awayCount; awayIndex += 1) {
          await page.clock.runFor(2_000);
          const focusedBeforeAway = await readClockSeconds(focusedTally);
          const remainingBeforeAway = await readClockSeconds(countdown);
          await leaveAndReturn(page, otherPage, 3_000);

          // 6. Màn quay lại giải thích rõ thời lượng lần này, thời gian bị loại và tổng số lần.
          await expect(
            page.getByRole('heading', { name: 'Đồng hồ tập trung đã dừng', exact: true })
          ).toBeVisible();
          const awayExplanation = page.locator('p').filter({ hasText: 'Bạn rời tab lúc' });
          await expect(awayExplanation).toContainText(/quay lại sau\s+3 giây/i);
          await expect(awayExplanation).toContainText(
            'Khoảng đó không tính vào thời gian tập trung.'
          );
          await expect(awayExplanation).toContainText(
            new RegExp(`Tổng trong phiên này:\\s*${awayIndex} lần`, 'i')
          );

          // 7. Nhánh b dùng lựa chọn tắt Strict ở lần cuối; cả hai thao tác đều tiếp tục timer.
          const turnOffStrict = scenario.key === 'b' && awayIndex === scenario.awayCount;
          await page
            .getByRole('button', {
              name: turnOffStrict ? 'Tắt chế độ nghiêm ngặt' : 'Tiếp tục',
              exact: true,
            })
            .click();
          await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
          const focusedAfterAway = await readClockSeconds(focusedTally);
          expect(focusedAfterAway - focusedBeforeAway).toBeGreaterThanOrEqual(0);
          expect(focusedAfterAway - focusedBeforeAway).toBeLessThanOrEqual(1);
          const remainingAfterAway = await readClockSeconds(countdown);
          expect(remainingBeforeAway - remainingAfterAway).toBeGreaterThanOrEqual(0);
          expect(remainingBeforeAway - remainingAfterAway).toBeLessThanOrEqual(1);
        }

        const observedFocusedSeconds = await readClockSeconds(focusedTally);
        expect(observedFocusedSeconds).toBe(scenario.awayCount * 2);
        const virtualEndedAt = await page.evaluate(() => Date.now());
        const virtualWallSeconds = Math.floor((virtualEndedAt - virtualStartedAt) / 1_000);
        expect(virtualWallSeconds - observedFocusedSeconds).toBeGreaterThanOrEqual(
          scenario.awayCount * 3 - 1
        );

        if (scenario.key === 'b') {
          // Config giữa phiên vẫn khóa switch, nhưng phản ánh lựa chọn tắt từ chính away panel.
          await page.getByRole('button', { name: 'Cấu hình Pomodoro', exact: true }).click();
          const strictOffDialog = page.getByRole('dialog', {
            name: 'Cấu hình Pomodoro',
            exact: true,
          });
          await expect(
            strictOffDialog.getByText(
              'Chế độ nghiêm ngặt đang tắt, giữ nguyên cho tới hết phiên.',
              { exact: true }
            )
          ).toBeVisible();
          await strictOffDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
        }

        // 8. Kết thúc qua UI và kiểm tra chính payload completion gửi tới record vừa tạo.
        const endResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
        );
        await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
        const endResponse = await endResponsePromise;
        expect(endResponse.status()).toBe(200);
        const completionPayload = endResponse.request().postDataJSON() as CompletionPayload;
        expect(completionPayload).toEqual({
          status: 'completed',
          focusedSeconds: observedFocusedSeconds,
          awayCount: scenario.awayCount,
          pomodorosCompleted: 0,
        });

        // 9. Summary và DB authoritative phải khớp payload cho đúng nhánh a/b.
        await expect(
          page.getByRole('heading', { name: 'Xong phiên học', exact: true })
        ).toBeVisible();
        const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
        const awaySummary = page.getByText('Lần rời tab', { exact: true }).locator('..');
        expect(await readClockSeconds(focusSummary)).toBe(completionPayload.focusedSeconds);
        await expect(awaySummary).toContainText(String(completionPayload.awayCount));

        const completed = await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: {
            userId: true,
            status: true,
            conceptIds: true,
            strictMode: true,
            awayCount: true,
            focusedSeconds: true,
            pomodorosCompleted: true,
            endedAt: true,
          },
        });
        expect(completed).toMatchObject({
          userId: seed.user.id,
          status: 'completed',
          conceptIds: [conceptC1.id],
          strictMode: true,
          awayCount: completionPayload.awayCount,
          focusedSeconds: completionPayload.focusedSeconds,
          pomodorosCompleted: completionPayload.pomodorosCompleted,
        });
        expect(completed.endedAt).not.toBeNull();
        expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
      } finally {
        // 10. Đóng tab phụ và cascade cleanup dữ liệu dù assertion visibility thất bại.
        await otherPage?.close().catch(() => undefined);
        await prisma.user.delete({ where: { id: seed.user.id } });
      }
    });
  }
});
