import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const activeSegmentMs = 3_100;
const pauseSegmentMs = 3_200;

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedFocusSession {
  id: string;
  startedAt: string;
}

interface CompletionPayload {
  status: 'completed';
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
}

const pauseScenarios = [
  {
    id: 'a',
    title: 'Một lần Pause/Resume giữ nguyên lượt và loại thời gian pause khỏi completion',
    pauseCount: 1,
  },
  {
    id: 'b',
    title: 'Hai lần Pause/Resume giữ nguyên lượt và loại toàn bộ thời gian pause',
    pauseCount: 2,
  },
] as const;

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-009: Tạm dừng và tiếp tục phiên học', () => {
  for (const scenario of pauseScenarios) {
    test(`${scenario.id}) ${scenario.title}`, async ({ page }) => {
      const seed = await seedFocusPlan(prisma, `tc_fs_009_${scenario.id}`);
      const conceptC1 = seed.concepts[0];
      if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

      try {
        // 1. Cài clock ảo trước khi mount Focus để hai nhánh độc lập không phải chờ thời gian thật.
        await loginViaUi(page, seed.user.email);
        await page.clock.install({ time: new Date(Date.now() + 60_000) });
        await page.clock.pauseAt(new Date(Date.now() + 60_000));
        await page.goto('/focus');

        // 2. Lấy session ID từ response Start thật; không dò một record bất kỳ trong DB.
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

        // Clock trình duyệt chạy nhanh hơn server. Backdate theo đúng tổng active+pause sắp chạy,
        // cộng một giây an toàn, để server chấp nhận focusedSeconds mà DB wall time vẫn có ý nghĩa.
        const expectedVirtualWallMs =
          activeSegmentMs * (scenario.pauseCount + 1) + pauseSegmentMs * scenario.pauseCount;
        await prisma.focusSession.update({
          where: { id: sessionId },
          data: { startedAt: new Date(Date.now() - expectedVirtualWallMs - 1_000) },
        });

        const countdown = page.getByRole('timer');
        const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
        const announcement = page.locator('p[role="status"][aria-live="polite"]');
        const sameRoundLabel = page.getByText(/Pomodoro 1\s*\/\s*4/);
        await expect(countdown).toBeVisible();
        await expect(focusedTally).toBeVisible();
        await expect(sameRoundLabel).toBeVisible();

        const roundStartRemaining = await readClockSeconds(countdown);
        const virtualStartedAt = await page.evaluate(() => Date.now());
        await page.clock.runFor(activeSegmentMs);
        const focusedAfterInitialRun = await readClockSeconds(focusedTally);
        const remainingAfterInitialRun = await readClockSeconds(countdown);
        expect(focusedAfterInitialRun).toBeGreaterThanOrEqual(2);
        expect(remainingAfterInitialRun).toBeLessThan(roundStartRemaining);

        // 3. Cùng một flow được data-drive cho a) một pause và b) hai pause/resume liên tiếp.
        for (let pauseIndex = 0; pauseIndex < scenario.pauseCount; pauseIndex += 1) {
          await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
          await expect(announcement).toHaveText('Đã tạm dừng.');

          const remainingAtPause = await readClockSeconds(countdown);
          const focusedAtPause = await readClockSeconds(focusedTally);
          await page.clock.runFor(pauseSegmentMs);

          // Cả countdown của lượt và tổng focused time phải đóng băng suốt khoảng pause.
          expect(await readClockSeconds(countdown)).toBe(remainingAtPause);
          expect(await readClockSeconds(focusedTally)).toBe(focusedAtPause);
          await expect(sameRoundLabel).toBeVisible();

          await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
          await expect(announcement).toHaveText('Đã tiếp tục.');
          await page.clock.runFor(activeSegmentMs);

          // Resume tiếp tục Pomodoro 1/4 từ mốc cũ, không reset về thời lượng đầu lượt.
          const remainingAfterResume = await readClockSeconds(countdown);
          const focusedAfterResume = await readClockSeconds(focusedTally);
          expect(remainingAfterResume).toBeLessThan(remainingAtPause);
          expect(remainingAfterResume).toBeLessThan(roundStartRemaining);
          expect(focusedAfterResume).toBeGreaterThanOrEqual(focusedAtPause + 2);
          await expect(sameRoundLabel).toBeVisible();
        }

        // 4. Pause lần cuối để chốt ref tích lũy vào UI trước khi đọc payload completion.
        await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
        const focusedBeforeEnd = await readClockSeconds(focusedTally);
        const virtualEndedAt = await page.evaluate(() => Date.now());
        const virtualWallSeconds = Math.floor((virtualEndedAt - virtualStartedAt) / 1_000);
        const pausedWholeSeconds = Math.floor((scenario.pauseCount * pauseSegmentMs) / 1_000);
        expect(virtualWallSeconds - focusedBeforeEnd).toBeGreaterThanOrEqual(pausedWholeSeconds);

        // 5. Kiểm trực tiếp completion PATCH: focusedSeconds khớp tally và không mang pause wall time.
        const completionResponsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
        );
        await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
        const completionResponse = await completionResponsePromise;
        expect(completionResponse.status()).toBe(200);
        const completionPayload = completionResponse.request().postDataJSON() as CompletionPayload;
        expect(completionPayload).toEqual({
          status: 'completed',
          focusedSeconds: focusedBeforeEnd,
          awayCount: 0,
          pomodorosCompleted: 0,
        });

        // 6. Summary và đúng record lấy từ response ID phải giữ nguyên số liệu sạch pause.
        await expect(
          page.getByRole('heading', { name: 'Xong phiên học', exact: true })
        ).toBeVisible();
        const focusSummary = page.getByText('Tập trung', { exact: true }).locator('..');
        expect(await readClockSeconds(focusSummary)).toBe(completionPayload.focusedSeconds);

        const sessions = await prisma.focusSession.findMany({
          where: { userId: seed.user.id },
          select: {
            id: true,
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
        expect(sessions).toHaveLength(1);
        const completed = sessions[0];
        if (!completed) throw new Error('Completed focus session was not persisted.');
        expect(completed).toMatchObject({
          id: sessionId,
          conceptIds: [conceptC1.id],
          status: 'completed',
          durationMinutes: Math.floor(completionPayload.focusedSeconds / 60),
          focusedSeconds: completionPayload.focusedSeconds,
          awayCount: 0,
          pomodorosCompleted: 0,
        });
        expect(completed.endedAt).not.toBeNull();
        const persistedWallSeconds = Math.floor(
          ((completed.endedAt?.getTime() ?? 0) - completed.startedAt.getTime()) / 1_000
        );
        expect(persistedWallSeconds - completed.focusedSeconds).toBeGreaterThanOrEqual(
          pausedWholeSeconds
        );
        expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
      } finally {
        // 7. Mỗi sub-test có Student/session riêng và luôn cascade cleanup.
        await prisma.user.delete({ where: { id: seed.user.id } });
      }
    });
  }
});
