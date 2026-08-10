import { expect, test, type Page, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const snapshotKey = 'recall.focusSession';
const noteBody = 'N1 vẫn tồn tại sau khi reload trang.';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
  startedAt: string;
}

interface SessionNoteDto {
  id: string;
  sessionId: string;
  conceptId: string;
  body: string;
}

interface StoredSnapshot {
  sessionId: string;
  startedAt: string;
  focusedMs: number;
  conceptName: string;
  planId: string | null;
  conceptIds: string[];
  userId: string | null;
}

type RecoveryUiState = 'resumed' | 'prompt' | 'setup' | 'loading';

/** Đọc snapshot timer cục bộ của đúng origin đang test. */
async function readStoredSnapshot(page: Page): Promise<StoredSnapshot | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
  }, snapshotKey);
}

/** Phân loại màn đầu tiên ổn định sau reload theo hai hành vi recovery được đặc tả cho phép. */
async function readRecoveryUiState(page: Page): Promise<RecoveryUiState> {
  if (
    await page
      .getByRole('dialog', { name: 'Phiên học chưa được ghi nhận', exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    return 'prompt';
  }
  if (
    await page
      .getByRole('timer')
      .isVisible()
      .catch(() => false)
  ) {
    return 'resumed';
  }
  if (
    await page
      .getByRole('button', { name: 'Bắt đầu', exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    return 'setup';
  }
  return 'loading';
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-024: Reload trang khi Focus Session đang chạy', () => {
  test('khôi phục S1 sau khoảng 10 giây mà không mất N1 hoặc tạo session mới', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_024');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const startRequests: Request[] = [];
    const captureStartRequest = (startRequest: Request) => {
      if (
        startRequest.method() === 'POST' &&
        startRequest.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      ) {
        startRequests.push(startRequest);
      }
    };
    page.on('request', captureStartRequest);

    try {
      // 1. Cài clock ảo, đăng nhập và tạo S1 qua UI/backend thật.
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
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

      // 2. Chạy hơn 10 giây để interval timer ghi snapshot cục bộ cho đúng S1/C1.
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await page.clock.runFor(11_000);
      expect(await readClockSeconds(focusedTally)).toBeGreaterThanOrEqual(10);
      const snapshotBeforeReload = await readStoredSnapshot(page);
      expect(snapshotBeforeReload).not.toBeNull();
      expect(snapshotBeforeReload).toMatchObject({
        sessionId,
        startedAt: startBody.data.startedAt,
        conceptName: conceptC1.name,
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
        userId: seed.user.id,
      });
      expect(snapshotBeforeReload?.focusedMs).toBeGreaterThanOrEqual(9_500);

      // 3. Nhập N1 và chờ đúng response POST auto-save trước khi reload.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const notesPanel = page.getByRole('complementary', {
        name: `Ghi chú nhanh cho khái niệm ${conceptC1.name}`,
        exact: true,
      });
      const noteInput = notesPanel.getByLabel(`Ghi chú cho khái niệm ${conceptC1.name}`, {
        exact: true,
      });
      const notesUrl = `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`;
      const noteResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url() === notesUrl
      );
      await noteInput.fill(noteBody);
      await page.clock.runFor(800);
      expect((await noteResponsePromise).status()).toBe(201);
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);

      // 4. F5 cùng tab, chờ app ổn định rồi yêu cầu resume trực tiếp hoặc recovery prompt.
      await page.reload();
      await expect.poll(() => readRecoveryUiState(page), { timeout: 6_000 }).not.toBe('loading');
      const recoveryState = await readRecoveryUiState(page);
      expect
        .soft(
          ['resumed', 'prompt'],
          'Reload snapshot ~10 giây phải tự resume S1 hoặc hiển thị recovery prompt; không được quay về setup.'
        )
        .toContain(recoveryState);

      // 5. Reload không được tự POST session thứ hai; snapshot vẫn trỏ đúng S1.
      await page.waitForLoadState('networkidle');
      expect(startRequests).toHaveLength(1);
      const snapshotAfterReload = await readStoredSnapshot(page);
      expect(snapshotAfterReload).not.toBeNull();
      expect(snapshotAfterReload?.sessionId).toBe(sessionId);
      expect(snapshotAfterReload?.conceptIds).toEqual([conceptC1.id]);

      // 6. DB chỉ có S1 running/endedAt null và N1 nguyên vẹn sau reload.
      expect(
        await prisma.focusSession.findMany({
          where: { userId: seed.user.id },
          select: { id: true, status: true, endedAt: true, conceptIds: true },
        })
      ).toEqual([{ id: sessionId, status: 'running', endedAt: null, conceptIds: [conceptC1.id] }]);
      expect(
        await prisma.sessionNote.findMany({
          where: { sessionId },
          select: { sessionId: true, conceptId: true, body: true },
        })
      ).toEqual([{ sessionId, conceptId: conceptC1.id, body: noteBody }]);

      // 7. API notes với token A cũng đọc lại đúng một N1, không phụ thuộc UI recovery bị lỗi.
      const notesResponse = await request.get(notesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(notesResponse.status()).toBe(200);
      const notesBody = (await notesResponse.json()) as ApiEnvelope<SessionNoteDto[]>;
      expect(notesBody.data).toEqual([
        expect.objectContaining({
          sessionId,
          conceptId: conceptC1.id,
          body: noteBody,
        }),
      ]);
    } finally {
      // 8. Tháo listener và cascade cleanup S1/N1 kể cả khi soft assertion recovery báo lỗi.
      page.off('request', captureStartRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
