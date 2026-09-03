import { expect, test, type Page, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const snapshotKey = 'recall.focusSession';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
  startedAt: string;
  conceptIds: string[];
}

interface StoredSnapshot {
  sessionId: string;
  startedAt: string;
  focusedMs: number;
  awayCount: number;
  pomodorosCompleted: number;
  conceptName: string;
  planId: string | null;
  conceptIds: string[];
  userId: string | null;
}

/** Tạo phiên, chạy hơn 1 phút và trả snapshot đủ điều kiện mở hộp khôi phục. */
async function prepareInterruptedSession(
  page: Page,
  seed: FocusPlanSeed
): Promise<{ sessionId: string; snapshot: StoredSnapshot }> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

  // 1. Dùng clock ảo nhưng vẫn đăng nhập/tạo session qua UI và backend thật.
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

  // 2. Backdate DB để recovery PATCH 60 giây hợp lệ với wall-clock thật của server.
  await prisma.focusSession.update({
    where: { id: startBody.data.id },
    data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
  });

  // 3. Chạy 61 giây để interval 10 giây ghi snapshot có focusedMs >= 60 giây.
  await page.clock.runFor(61_000);
  const snapshot = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
  }, snapshotKey);
  expect(snapshot).not.toBeNull();
  if (!snapshot) throw new Error('Focus snapshot was not written.');
  expect(snapshot).toMatchObject({
    sessionId: startBody.data.id,
    startedAt: startBody.data.startedAt,
    conceptName: conceptC1.name,
    planId: seed.plan.id,
    conceptIds: [conceptC1.id],
    userId: seed.user.id,
    awayCount: 0,
    pomodorosCompleted: 0,
  });
  expect(Math.floor(snapshot.focusedMs / 1_000)).toBeGreaterThanOrEqual(60);
  return { sessionId: startBody.data.id, snapshot };
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-016: Khôi phục phiên bị gián đoạn sau khi đóng tab', () => {
  test('a) Ghi nhận snapshot hoàn tất đúng record rồi xóa dữ liệu khôi phục', async ({
    page,
    context,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_016_commit');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    let recoveryPage: Page | null = null;
    const patchRequests: Request[] = [];

    try {
      // 1. Chuẩn bị phiên đang chạy và xác minh snapshot chứa started_at/thời gian tập trung.
      const { sessionId, snapshot: snapshotBeforeClose } = await prepareInterruptedSession(
        page,
        seed
      );
      const beforeClose = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true, endedAt: true },
      });
      expect(beforeClose).toEqual({ status: 'running', endedAt: null });

      // 2. Đóng tab mà không Kết thúc/Hủy; mở tab mới trong cùng browser context.
      await page.close();
      recoveryPage = await context.newPage();
      recoveryPage.on('request', (request) => {
        if (
          request.method() === 'PATCH' &&
          request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
        ) {
          patchRequests.push(request);
        }
      });
      await recoveryPage.goto('/focus');

      // 3. Web Lock đã nhả nên app phải hỏi khôi phục đúng C1 và số phút đo được.
      const dialog = recoveryPage.getByRole('dialog', {
        name: 'Phiên học chưa được ghi nhận',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(conceptC1.name);
      const recoveredSnapshot = await recoveryPage.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
      }, snapshotKey);
      expect(recoveredSnapshot).not.toBeNull();
      if (!recoveredSnapshot) throw new Error('Recovery page did not find the stored snapshot.');
      expect(recoveredSnapshot.sessionId).toBe(sessionId);
      expect(recoveredSnapshot.startedAt).toBe(snapshotBeforeClose.startedAt);
      expect(recoveredSnapshot.focusedMs).toBeGreaterThanOrEqual(snapshotBeforeClose.focusedMs);
      const focusedSeconds = Math.floor(recoveredSnapshot.focusedMs / 1_000);
      await expect(dialog).toContainText(`${Math.floor(focusedSeconds / 60)} phút tập trung`);

      // 4. Chọn Ghi nhận và đồng bộ bằng response PATCH thật trước khi đọc DB.
      const recoveryResponsePromise = recoveryPage.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
      );
      await dialog.getByRole('button', { name: /^Ghi nhận \d+ phút$/ }).click();
      expect((await recoveryResponsePromise).status()).toBe(200);
      expect(patchRequests).toHaveLength(1);
      expect(patchRequests[0]?.postDataJSON()).toEqual({
        status: 'completed',
        focusedSeconds,
        awayCount: recoveredSnapshot.awayCount,
        pomodorosCompleted: recoveredSnapshot.pomodorosCompleted,
      });
      await expect(dialog).toHaveCount(0);

      // 5. DB hoàn tất chính record cũ bằng focused snapshot, không tạo record thứ hai.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          userId: true,
          conceptIds: true,
          status: true,
          focusedSeconds: true,
          durationMinutes: true,
          awayCount: true,
          pomodorosCompleted: true,
          endedAt: true,
        },
      });
      expect(completed).toMatchObject({
        userId: seed.user.id,
        conceptIds: [conceptC1.id],
        status: 'completed',
        focusedSeconds,
        durationMinutes: Math.floor(focusedSeconds / 60),
        awayCount: recoveredSnapshot.awayCount,
        pomodorosCompleted: recoveredSnapshot.pomodorosCompleted,
      });
      expect(completed.endedAt).not.toBeNull();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
      expect(
        await recoveryPage.evaluate((key) => localStorage.getItem(key), snapshotKey)
      ).toBeNull();

      // 6. Reload lần nữa không được hỏi lại hoặc PATCH trùng phiên đã xử lý.
      await recoveryPage.reload();
      await expect(
        recoveryPage.getByRole('dialog', { name: 'Phiên học chưa được ghi nhận', exact: true })
      ).toHaveCount(0);
      expect(patchRequests).toHaveLength(1);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
    } finally {
      // 7. Đóng tab phục hồi và cascade cleanup dữ liệu.
      await recoveryPage?.close().catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Bỏ qua không hoàn tất record, xóa snapshot và không hỏi lại', async ({
    page,
    context,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_016_discard');
    let recoveryPage: Page | null = null;
    const patchRequests: Request[] = [];

    try {
      // 1. Tạo một phiên độc lập có snapshot >= 1 phút rồi đóng tab gốc.
      const { sessionId } = await prepareInterruptedSession(page, seed);
      await page.close();
      recoveryPage = await context.newPage();
      recoveryPage.on('request', (request) => {
        if (
          request.method() === 'PATCH' &&
          request.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
        ) {
          patchRequests.push(request);
        }
      });
      // Chờ các request khởi tạo của màn Focus hoàn tất trước khi tương tác với portal Dialog.
      // Nếu click đúng lúc entry state vừa được commit, Radix có thể thay node nút và làm locator
      // bị detached giữa bước kiểm tra actionability và lần click.
      const queueResponsePromise = recoveryPage.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname === '/api/v1/review-queue/today'
      );
      const configResponsePromise = recoveryPage.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname === '/api/v1/users/me/pomodoro-config'
      );
      await recoveryPage.goto('/focus');
      await Promise.all([queueResponsePromise, configResponsePromise]);

      // 2. Hộp khôi phục xuất hiện; chọn nhãn thực tế Bỏ qua (tương đương Không ghi nhận).
      const dialog = recoveryPage.getByRole('dialog', {
        name: 'Phiên học chưa được ghi nhận',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      const discardButton = dialog.getByRole('button', { name: 'Bỏ qua', exact: true });
      await expect(discardButton).toBeEnabled();
      await discardButton.click();
      await expect(dialog).toHaveCount(0);

      // 3. Không tạo completed; implementation có thể giữ running hoặc cleanup thành cancelled.
      const discardedSession = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true, durationMinutes: true },
      });
      expect(discardedSession.status).not.toBe('completed');
      expect(discardedSession.durationMinutes).toBe(0);
      expect(
        await prisma.focusSession.count({ where: { userId: seed.user.id, status: 'completed' } })
      ).toBe(0);
      expect(
        await recoveryPage.evaluate((key) => localStorage.getItem(key), snapshotKey)
      ).toBeNull();

      // 4. Reload không lặp prompt vô hạn và vẫn không phát sinh PATCH/record mới.
      await recoveryPage.reload();
      await expect(
        recoveryPage.getByRole('dialog', { name: 'Phiên học chưa được ghi nhận', exact: true })
      ).toHaveCount(0);
      expect(
        await prisma.focusSession.count({ where: { userId: seed.user.id, status: 'completed' } })
      ).toBe(0);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
    } finally {
      // 5. Đóng tab phục hồi và cascade cleanup record running cùng toàn bộ seed.
      await recoveryPage?.close().catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
