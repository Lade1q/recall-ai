import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

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
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface EndPayload {
  status: string;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
}

interface StoredSnapshot {
  sessionId: string;
  focusedMs: number;
  conceptIds: string[];
}

/** Bắt đầu phiên C1 từ UI và đồng bộ bằng response POST trước khi caller đọc DB. */
async function startUiSession(page: Page): Promise<string> {
  await page.goto('/focus');
  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
  );
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(201);
  const body = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
  return body.data.id;
}

/** Đọc snapshot JSON thật của timer từ localStorage. */
async function readStoredSnapshot(page: Page): Promise<StoredSnapshot | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
  }, snapshotKey);
}

/** Chuyển network context và xác nhận navigator.onLine đã phản ánh trạng thái mới. */
async function setNetworkOffline(
  context: BrowserContext,
  page: Page,
  offline: boolean
): Promise<void> {
  await context.setOffline(offline);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(!offline);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-015: Timer offline và tự đồng bộ completion khi online lại', () => {
  test('a) Timer/snapshot tiếp tục offline; PATCH lỗi không tạo record thiếu hoặc trùng', async ({
    page,
    context,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_015_offline');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    let offline = false;

    try {
      // 1. Cài clock ảo, đăng nhập và bắt đầu một phiên C1 khi còn online.
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      const sessionId = await startUiSession(page);
      await prisma.focusSession.update({
        where: { id: sessionId },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });

      // 2. Chạy T1 = 3 giây online rồi ngắt mạng thật ở BrowserContext.
      await page.clock.runFor(3_000);
      const focusedAfterT1 = await readClockSeconds(focusedTally);
      expect(focusedAfterT1).toBeGreaterThanOrEqual(3);
      await setNetworkOffline(context, page, true);
      offline = true;

      // 3. Chạy T2 = 8 giây offline; timer và snapshot phải cộng tiếp, không reset.
      await page.clock.runFor(8_000);
      const focusedAfterT2 = await readClockSeconds(focusedTally);
      expect(focusedAfterT2 - focusedAfterT1).toBeGreaterThanOrEqual(8);
      const snapshotBeforeEnd = await readStoredSnapshot(page);
      expect(snapshotBeforeEnd).not.toBeNull();
      expect(snapshotBeforeEnd?.sessionId).toBe(sessionId);
      expect(snapshotBeforeEnd?.conceptIds).toEqual([conceptC1.id]);
      expect(Math.floor((snapshotBeforeEnd?.focusedMs ?? 0) / 1_000)).toBeGreaterThanOrEqual(
        focusedAfterT2 - 1
      );

      // 4. Kết thúc khi offline: request phải thất bại rõ ràng và UI báo không kết nối được.
      const failedEndPromise = page.waitForEvent('requestfailed', {
        predicate: (request) =>
          request.method() === 'PATCH' &&
          request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`,
      });
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      const failedEnd = await failedEndPromise;
      expect(failedEnd.failure()?.errorText).toBeTruthy();
      await expect(
        page.getByText('Không kết nối được tới máy chủ. Vui lòng thử lại.', { exact: true })
      ).toBeVisible();

      // 5. Backend chỉ còn đúng record gốc ở running; snapshot không bị xóa sau lỗi tạm thời.
      const sessionsWhileOffline = await prisma.focusSession.findMany({
        where: { userId: seed.user.id },
        select: { id: true, status: true, endedAt: true },
      });
      expect(sessionsWhileOffline).toEqual([{ id: sessionId, status: 'running', endedAt: null }]);
      expect((await readStoredSnapshot(page))?.sessionId).toBe(sessionId);

      // 6. Sau request lỗi, timer vẫn tiếp tục từ số cũ để Student không mất tiến trình.
      await page.clock.runFor(2_000);
      expect(await readClockSeconds(focusedTally)).toBeGreaterThanOrEqual(focusedAfterT2 + 2);
      await expect(
        page.getByRole('button', { name: 'Kết thúc phiên học', exact: true })
      ).toBeEnabled();
    } finally {
      // 7. Khôi phục network trước khi đóng context và cascade cleanup dữ liệu.
      if (offline) await context.setOffline(false).catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Online lại phải tự retry đúng một lần và hoàn tất chính record đang chạy', async ({
    page,
    context,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_015_sync');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const endRequests: Request[] = [];
    let offline = false;
    let sessionId = '';
    const captureEndRequest = (request: Request) => {
      if (
        sessionId &&
        request.method() === 'PATCH' &&
        request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
      ) {
        endRequests.push(request);
      }
    };
    page.on('request', captureEndRequest);

    try {
      // 1. Bắt đầu phiên online, backdate DB và chạy T1 trước khi mất mạng.
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      sessionId = await startUiSession(page);
      await prisma.focusSession.update({
        where: { id: sessionId },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await page.clock.runFor(2_000);
      const focusedAfterT1 = await readClockSeconds(focusedTally);

      // 2. Ngắt mạng, chạy thêm T2 rồi yêu cầu kết thúc; lưu chính payload bị thất bại.
      await setNetworkOffline(context, page, true);
      offline = true;
      await page.clock.runFor(4_000);
      const focusedBeforeEnd = await readClockSeconds(focusedTally);
      expect(focusedBeforeEnd - focusedAfterT1).toBeGreaterThanOrEqual(4);
      const failedEndPromise = page.waitForEvent('requestfailed', {
        predicate: (request) =>
          request.method() === 'PATCH' &&
          request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`,
      });
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      const failedEnd = await failedEndPromise;
      const queuedPayload = failedEnd.postDataJSON() as EndPayload;
      expect(queuedPayload).toMatchObject({
        status: 'completed',
        awayCount: 0,
        pomodorosCompleted: 0,
      });
      expect(queuedPayload.focusedSeconds).toBeGreaterThanOrEqual(focusedBeforeEnd);
      expect(endRequests).toHaveLength(1);

      // 3. Online lại phải tự replay completion, không cần Student bấm lần hai.
      await setNetworkOffline(context, page, false);
      offline = false;
      await expect
        .poll(
          async () =>
            (
              await prisma.focusSession.findUniqueOrThrow({
                where: { id: sessionId },
                select: { status: true },
              })
            ).status,
          {
            timeout: 6_000,
            message:
              'Chưa implement hàng đợi completion/listener online để tự retry PATCH focus session',
          }
        )
        .toBe('completed');

      // 4. Sau sync phải có đúng một record, đúng C1/T của payload và không còn snapshot pending.
      const synced = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          userId: true,
          conceptIds: true,
          status: true,
          focusedSeconds: true,
          durationMinutes: true,
          endedAt: true,
        },
      });
      expect(synced).toMatchObject({
        userId: seed.user.id,
        conceptIds: [conceptC1.id],
        status: 'completed',
        focusedSeconds: queuedPayload.focusedSeconds,
        durationMinutes: Math.floor(queuedPayload.focusedSeconds / 60),
      });
      expect(synced.endedAt).not.toBeNull();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
      expect(endRequests).toHaveLength(2);
      expect(endRequests[1]?.postDataJSON()).toEqual(queuedPayload);
      expect(await readStoredSnapshot(page)).toBeNull();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();

      // 5. Chờ thêm một nhịp để chứng minh online event không gửi trùng completion lần nữa.
      await page.clock.runFor(1_000);
      expect(endRequests).toHaveLength(2);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
    } finally {
      // 6. Luôn tháo listener, khôi phục network và cascade cleanup.
      page.off('request', captureEndRequest);
      if (offline) await context.setOffline(false).catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
