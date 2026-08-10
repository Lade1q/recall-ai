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
  success: true;
  data: T;
}

interface CreatedFocusSession {
  id: string;
}

interface CompletedFocusSession {
  id: string;
  status: 'completed';
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
}

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

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-008: Kết thúc sớm và chỉ lưu thời gian tập trung thực tế', () => {
  for (const scenario of [
    { key: 'a', label: '65 giây tập trung liên tục', interruptions: false, awayCount: 0 },
    {
      key: 'b',
      label: '65 giây tập trung có thời gian pause và rời tab Strict Mode',
      interruptions: true,
      awayCount: 1,
    },
  ] as const) {
    test(`${scenario.key}) ${scenario.label}`, async ({ page }) => {
      const seed = await seedFocusPlan(prisma, `tc_fs_008_${scenario.key}`);
      const conceptC1 = seed.concepts[0];
      if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

      try {
        // 1. Dùng lượt work hai phút để có thể chủ động kết thúc đúng ở giây tập trung thứ 65.
        await prisma.user.update({
          where: { id: seed.user.id },
          data: {
            pomodoroConfig: {
              work: 2,
              short_break: 1,
              long_break: 1,
              cycles: 1,
              sound: false,
            },
          },
        });
        await loginViaUi(page, seed.user.email);
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now() + 60_000));
        await page.goto('/focus');

        // 2. Lấy ID từ response tạo phiên để mọi assertion request/DB cùng trỏ một record.
        const createResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
        );
        await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);
        const created = (await createResponse.json()) as ApiEnvelope<CreatedFocusSession>;
        const sessionId = created.data.id;

        // 3. Backdate riêng record test để server chấp nhận clock trình duyệt tăng tốc 65 giây.
        await prisma.focusSession.update({
          where: { id: sessionId },
          data: { startedAt: new Date(Date.now() - 5 * 60 * 1_000) },
        });
        const timer = page.getByRole('timer');
        const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
        await expect(timer).toBeVisible();
        const virtualStartedAt = await page.evaluate(() => Date.now());

        if (scenario.interruptions) {
          // 4b. Tập trung 30s, pause 7s, tập trung 20s, rời tab 8s rồi tập trung thêm 15s.
          await page.clock.runFor(30_000);
          await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
          const pausedTimer = await readClockSeconds(timer);
          const pausedFocused = await readClockSeconds(focusedTally);
          await page.clock.runFor(7_000);
          expect(await readClockSeconds(timer)).toBe(pausedTimer);
          expect(await readClockSeconds(focusedTally)).toBe(pausedFocused);

          await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
          await page.clock.runFor(20_000);
          const beforeAwayTimer = await readClockSeconds(timer);
          const beforeAwayFocused = await readClockSeconds(focusedTally);
          await dispatchVisibility(page, true);
          await page.clock.runFor(8_000);
          await dispatchVisibility(page, false);
          await expect(
            page.getByRole('heading', { name: 'Đồng hồ tập trung đã dừng', exact: true })
          ).toBeVisible();
          await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
          expect(await readClockSeconds(timer)).toBe(beforeAwayTimer);
          const focusedAfterAway = await readClockSeconds(focusedTally);
          expect(focusedAfterAway).toBe(beforeAwayFocused);

          // Clock bị pause giữa các action nên có thể tiến chính xác phần còn lại tới giây 65.
          const remainingFocusedSeconds = 65 - focusedAfterAway;
          expect(remainingFocusedSeconds).toBe(15);
          await page.clock.runFor(remainingFocusedSeconds * 1_000);
        } else {
          // 4a. Nhánh cơ sở chỉ tăng đúng 65 giây tập trung, không có pause/away.
          await page.clock.runFor(65_000);
        }

        await expect.poll(() => readClockSeconds(focusedTally)).toBe(65);
        await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
        const virtualEndedAt = await page.evaluate(() => Date.now());
        const virtualWallSeconds = Math.floor((virtualEndedAt - virtualStartedAt) / 1_000);
        if (scenario.interruptions) {
          // Wall time có thêm đúng 7s pause + 8s away.
          expect(virtualWallSeconds - 65).toBe(15);
        } else {
          expect(virtualWallSeconds).toBe(65);
        }

        // 5. Kết thúc sớm đúng một lần và kiểm tra chính payload completion gửi lên server.
        let completionRequests = 0;
        const countCompletion = (request: { method(): string; url(): string }) => {
          if (
            request.method() === 'PATCH' &&
            request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
          ) {
            completionRequests += 1;
          }
        };
        page.on('request', countCompletion);
        const endResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
        );
        await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
        const endResponse = await endResponsePromise;
        expect(endResponse.status()).toBe(200);
        expect(endResponse.request().postDataJSON()).toEqual({
          status: 'completed',
          focusedSeconds: 65,
          awayCount: scenario.awayCount,
          pomodorosCompleted: 0,
        });
        const ended = (await endResponse.json()) as ApiEnvelope<CompletedFocusSession>;
        expect(ended.data).toMatchObject({
          id: sessionId,
          status: 'completed',
          focusedSeconds: 65,
          durationMinutes: 1,
          awayCount: scenario.awayCount,
          pomodorosCompleted: 0,
        });
        expect(completionRequests).toBe(1);
        page.off('request', countCompletion);

        // 6. Summary và DB phải cùng số liệu; pause/away không được làm tăng focusedSeconds.
        await expect(
          page.getByRole('heading', { name: 'Xong phiên học', exact: true })
        ).toBeVisible();
        const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
        const awaySummary = page.getByText('Lần rời tab', { exact: true }).locator('..');
        expect(await readClockSeconds(focusSummary)).toBe(65);
        await expect(awaySummary).toContainText(String(scenario.awayCount));

        const sessions = await prisma.focusSession.findMany({
          where: { userId: seed.user.id },
          select: {
            id: true,
            status: true,
            conceptIds: true,
            durationMinutes: true,
            focusedSeconds: true,
            awayCount: true,
            pomodorosCompleted: true,
          },
        });
        expect(sessions).toEqual([
          {
            id: sessionId,
            status: 'completed',
            conceptIds: [conceptC1.id],
            durationMinutes: Math.floor(65 / 60),
            focusedSeconds: 65,
            awayCount: scenario.awayCount,
            pomodorosCompleted: 0,
          },
        ]);
        expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
      } finally {
        await prisma.user.delete({ where: { id: seed.user.id } });
      }
    });
  }
});
