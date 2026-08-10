import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const onlineNote = 'Định nghĩa ban đầu';
const offlineNote = 'Ghi chú bổ sung khi mất mạng';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface SessionNoteDto {
  id: string;
  sessionId: string;
  conceptId: string;
  body: string;
}

interface PersistedDraft {
  conceptId: string;
  noteId: string | null;
  body: string;
}

/** Bật/tắt network thật của browser context và đợi `navigator.onLine` phản ánh trạng thái mới. */
async function setNetworkOffline(
  context: BrowserContext,
  page: Page,
  offline: boolean
): Promise<void> {
  await context.setOffline(offline);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(!offline);
}

/** Đọc đúng draft của note trong phiên; null chứng minh draft pending đã được dọn sau sync. */
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

test.describe('TC-FS-020: Auto-save ghi chú offline và đồng bộ khi online lại', () => {
  test('giữ N2 cục bộ, tự sync đè N1 đúng một record và đọc lại sau khi hoàn tất', async ({
    page,
    context,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_020');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const noteMutations: Request[] = [];
    let offline = false;
    let notesCollectionUrl = '';
    const captureNoteMutation = (noteRequest: Request) => {
      if (
        notesCollectionUrl &&
        noteRequest.url().startsWith(notesCollectionUrl) &&
        ['POST', 'PATCH'].includes(noteRequest.method())
      ) {
        noteMutations.push(noteRequest);
      }
    };
    page.on('request', captureNoteMutation);

    try {
      // 1. Đăng nhập và bắt đầu phiên C1 online; lấy session ID từ chính response POST.
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
      notesCollectionUrl = `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`;
      await prisma.focusSession.update({
        where: { id: sessionId },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });

      // 2. Mở panel, đợi danh sách thật tải xong rồi auto-save N1 bằng POST khi còn online.
      const listResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'GET' && response.url() === notesCollectionUrl
      );
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      expect((await listResponsePromise).status()).toBe(200);
      const notesPanel = page.getByRole('complementary', {
        name: `Ghi chú nhanh cho khái niệm ${conceptC1.name}`,
        exact: true,
      });
      const noteInput = notesPanel.getByLabel(`Ghi chú cho khái niệm ${conceptC1.name}`, {
        exact: true,
      });
      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url() === notesCollectionUrl
      );
      await noteInput.fill(onlineNote);
      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(201);
      const createdNote = (await createResponse.json()) as ApiEnvelope<SessionNoteDto>;
      const noteId = createdNote.data.id;
      const noteItemUrl = `${notesCollectionUrl}/${noteId}`;
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
      expect(await readPersistedDraft(page, sessionId)).toBeNull();
      expect(
        await prisma.sessionNote.findUniqueOrThrow({
          where: { id: noteId },
          select: { sessionId: true, conceptId: true, body: true },
        })
      ).toEqual({ sessionId, conceptId: conceptC1.id, body: onlineNote });

      // 3. Ngắt mạng, nhập N2 và đợi đúng PATCH thất bại thay vì dùng thời gian chờ cố định.
      await setNetworkOffline(context, page, true);
      offline = true;
      const failedUpdatePromise = page.waitForEvent('requestfailed', {
        predicate: (failedRequest) =>
          failedRequest.method() === 'PATCH' && failedRequest.url() === noteItemUrl,
      });
      await noteInput.fill(offlineNote);
      const failedUpdate = await failedUpdatePromise;
      expect(failedUpdate.failure()?.errorText).toBeTruthy();

      // 4. UI phải báo chưa đồng bộ, giữ nguyên N2 cả trong textarea và localStorage; DB vẫn là N1.
      await expect(notesPanel.getByRole('status')).toHaveText('Ngoại tuyến · sẽ lưu lại');
      await expect(noteInput).toHaveValue(offlineNote);
      expect(await readPersistedDraft(page, sessionId)).toEqual({
        conceptId: conceptC1.id,
        noteId,
        body: offlineNote,
      });
      expect(
        await prisma.sessionNote.findUniqueOrThrow({
          where: { id: noteId },
          select: { body: true },
        })
      ).toEqual({ body: onlineNote });

      // 5. Có mạng lại phải tự PATCH N2 vào đúng ID cũ, dọn draft và không cần thao tác lưu tay.
      const syncResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.url() === noteItemUrl
      );
      await setNetworkOffline(context, page, false);
      offline = false;
      const syncResponse = await syncResponsePromise;
      expect(syncResponse.status()).toBe(200);
      const syncedNote = (await syncResponse.json()) as ApiEnvelope<SessionNoteDto>;
      expect(syncedNote.data).toMatchObject({
        id: noteId,
        sessionId,
        conceptId: conceptC1.id,
        body: offlineNote,
      });
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
      await expect(noteInput).toHaveValue(offlineNote);
      expect(await readPersistedDraft(page, sessionId)).toBeNull();
      expect(
        await prisma.sessionNote.findMany({
          where: { sessionId },
          select: { id: true, conceptId: true, body: true },
        })
      ).toEqual([{ id: noteId, conceptId: conceptC1.id, body: offlineNote }]);

      // 6. Đóng/mở panel để đọc lại từ server: chỉ N2 xuất hiện, không revert N1 hoặc nhân đôi note.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const reloadNotesPromise = page.waitForResponse(
        (response) => response.request().method() === 'GET' && response.url() === notesCollectionUrl
      );
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      expect((await reloadNotesPromise).status()).toBe(200);
      await expect(notesPanel.getByRole('listitem')).toHaveCount(1);
      await expect(notesPanel.getByRole('listitem')).toContainText(offlineNote);
      await expect(notesPanel.getByRole('listitem')).not.toContainText(onlineNote);

      // 7. Hoàn tất phiên qua UI, rồi đọc notes qua API và DB sau completion.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      const endResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      expect((await endResponsePromise).status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();

      const notesResponse = await request.get(notesCollectionUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(notesResponse.status()).toBe(200);
      const notesBody = (await notesResponse.json()) as ApiEnvelope<SessionNoteDto[]>;
      expect(notesBody.data).toEqual([
        expect.objectContaining({
          id: noteId,
          sessionId,
          conceptId: conceptC1.id,
          body: offlineNote,
        }),
      ]);
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { status: true, endedAt: true, notes: { select: { id: true } } },
        })
      ).toEqual({ status: 'completed', endedAt: expect.any(Date), notes: [{ id: noteId }] });
      expect(noteMutations.filter((mutation) => mutation.method() === 'POST')).toHaveLength(1);
    } finally {
      // 8. Luôn tháo listener, khôi phục network và cascade cleanup session/note từ User gốc.
      page.off('request', captureNoteMutation);
      if (offline) await context.setOffline(false).catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
