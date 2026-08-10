import { expect, test, type Page, type Route } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const failedNote = 'N1 vẫn phải còn nguyên khi máy chủ lưu lỗi';

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface PersistedDraft {
  conceptId: string;
  noteId: string | null;
  body: string;
}

async function readPersistedDraft(page: Page, sessionId: string): Promise<PersistedDraft | null> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`recall.sessionNote.draft.${id}`);
    return raw ? (JSON.parse(raw) as PersistedDraft) : null;
  }, sessionId);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-020: Auto-save ghi chú gặp lỗi máy chủ có kiểm soát', () => {
  test('503 không tạo thành công giả, giữ N1 và không làm hỏng phiên đang chạy', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_020');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    let notesCollectionUrl: string | null = null;
    let failNoteSave: ((route: Route) => Promise<void>) | null = null;

    try {
      // 1. Bắt đầu một phiên thật và lấy session ID từ response tạo phiên.
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
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
      const sessionId = startBody.data.id;
      notesCollectionUrl = `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`;

      // 2. Mở rail và để GET danh sách chạy thật; chỉ fault-inject mutation POST của case này.
      const listResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'GET' && response.url() === notesCollectionUrl
      );
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      expect((await listResponsePromise).status()).toBe(200);
      let failedSaveAttempts = 0;
      failNoteSave = async (route: Route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        failedSaveAttempts += 1;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled test failure' },
          }),
        });
      };
      await page.context().route(notesCollectionUrl, failNoteSave);

      const notesPanel = page.getByRole('complementary', {
        name: `Ghi chú nhanh cho khái niệm ${conceptC1.name}`,
        exact: true,
      });
      const noteInput = notesPanel.getByLabel(`Ghi chú cho khái niệm ${conceptC1.name}`, {
        exact: true,
      });
      const timer = page.getByRole('timer');
      const remainingBeforeFailure = await readClockSeconds(timer);

      // 3. Nhập N1 và chờ autosave nhận 503; UI tuyệt đối không được tuyên bố đã lưu.
      const failedResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url() === notesCollectionUrl
      );
      await noteInput.fill(failedNote);
      expect((await failedResponsePromise).status()).toBe(503);
      await expect(notesPanel.getByRole('status')).toHaveText('Lưu lỗi · thử lại');
      expect(failedSaveAttempts).toBeGreaterThanOrEqual(1);
      await expect(notesPanel.getByRole('status')).not.toContainText('Đã lưu');
      await expect(noteInput).toHaveValue(failedNote);

      // 4. Timer/session vẫn sống; DB không có note giả và draft cục bộ giữ đúng nội dung đang gõ.
      await expect
        .poll(() => readClockSeconds(timer), { timeout: 4_000 })
        .toBeLessThan(remainingBeforeFailure);
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      expect(await prisma.sessionNote.count({ where: { sessionId } })).toBe(0);
      expect(await readPersistedDraft(page, sessionId)).toEqual({
        conceptId: conceptC1.id,
        noteId: null,
        body: failedNote,
      });

      // 5. Remount rail trong cùng session để đọc lại draft; retry vẫn lỗi và không sinh record.
      const notesButton = page.getByRole('button', { name: 'Ghi chú nhanh', exact: true });
      await notesButton.click();
      await expect(notesPanel).toHaveCount(0);
      await notesButton.click();
      await expect(notesPanel).toBeVisible();
      await expect(noteInput).toHaveValue(failedNote);
      await expect(notesPanel.getByRole('status')).toHaveText('Lưu lỗi · thử lại');
      expect(await prisma.sessionNote.count({ where: { sessionId } })).toBe(0);
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { status: true, endedAt: true },
        })
      ).toEqual({ status: 'running', endedAt: null });

      // Không chuyển offline/online: case này không khẳng định có auto-sync sau reconnect.
    } finally {
      // Đóng page để dừng debounce/retry trước khi tháo fault route và cleanup DB.
      await page.close().catch(() => undefined);
      if (notesCollectionUrl && failNoteSave) {
        await page.context().unroute(notesCollectionUrl, failNoteSave);
      }
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
