import { expect, test, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const snapshotKey = 'recall.focusSession';

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface StoredSnapshot {
  sessionId: string;
  focusedMs: number;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-024: Reload phiên dưới 60 giây — regression #311', () => {
  test('không hiện recovery, không tạo S2 và đóng S1 cancelled ngay khi reload', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_024');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const startRequests: Request[] = [];
    const captureStartRequest = (request: Request) => {
      if (
        request.method() === 'POST' &&
        request.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      ) {
        startRequests.push(request);
      }
    };
    page.on('request', captureStartRequest);

    try {
      // 1. Tạo S1 thật và chạy 11 giây: có snapshot nhưng vẫn thấp hơn ngưỡng recovery 60 giây.
      await loginViaUi(page, seed.user.email);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 60_000));
      await page.goto('/focus');
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
      const sessionId = startBody.data.id;
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await page.clock.runFor(11_000);
      const observedSeconds = await readClockSeconds(focusedTally);
      expect(observedSeconds).toBeGreaterThanOrEqual(10);
      expect(observedSeconds).toBeLessThan(60);
      const snapshotBeforeReload = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
      }, snapshotKey);
      expect(snapshotBeforeReload).toMatchObject({ sessionId });
      expect((snapshotBeforeReload?.focusedMs ?? 60_000) / 1_000).toBeLessThan(60);

      // 2. Reload là hành động abandon S1 ngắn; UX by-design phải quay về setup, không mời recovery.
      await page.reload();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
      await expect(
        page.getByRole('dialog', { name: 'Phiên học chưa được ghi nhận', exact: true })
      ).toHaveCount(0);
      await expect(page.getByRole('timer')).toHaveCount(0);

      // 3. Reload không được tạo S2; setup chỉ là state client trước khi Student nhấn Start lại.
      await page.waitForLoadState('networkidle');
      expect(startRequests).toHaveLength(1);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);

      // 4. Contract của #311: S1 phải được đóng ngay thành cancelled, không nằm running tới 8 giờ.
      // Assertion này cố ý giữ đúng requirement; hiện tại nó tái hiện ổn định bug đã được xác nhận.
      await expect
        .poll(
          () =>
            prisma.focusSession.findUniqueOrThrow({
              where: { id: sessionId },
              select: {
                status: true,
                endedAt: true,
                durationMinutes: true,
                conceptIds: true,
              },
            }),
          { timeout: 3_000 }
        )
        .toEqual({
          status: 'cancelled',
          endedAt: expect.any(Date),
          durationMinutes: 0,
          conceptIds: [conceptC1.id],
        });
    } finally {
      page.off('request', captureStartRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
