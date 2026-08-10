import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const initialNote = 'Định nghĩa cây nhị phân';
const editedNote = 'Định nghĩa cây nhị phân: mỗi nút có tối đa hai con';
const secondNote = 'Duyệt inorder: trái-gốc-phải';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface CreatedNote {
  id: string;
  conceptId: string;
  body: string;
}

interface FocusSessionListItem {
  id: string;
  status: string;
  concepts: Array<{ id: string; name: string }>;
}

/** Tạo phiên C1+C2 qua backend thật để kiểm tra phần tích hợp chưa có lối vào UI. */
async function createMultiConceptSession(
  request: APIRequestContext,
  accessToken: string,
  seed: FocusPlanSeed
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      planId: seed.plan.id,
      conceptIds: seed.concepts.slice(0, 2).map((concept) => concept.id),
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as ApiEnvelope<CreatedSession>;
  return body.data.id;
}

/** Tạo một ghi chú qua API thật và trả DTO đã lưu. */
async function createNoteViaApi(
  request: APIRequestContext,
  accessToken: string,
  sessionId: string,
  conceptId: string,
  body: string
): Promise<CreatedNote> {
  const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { conceptId, body },
  });
  expect(response.status()).toBe(201);
  const responseBody = (await response.json()) as ApiEnvelope<CreatedNote>;
  return responseBody.data;
}

/** Hoàn tất phiên test với 0 giây để kiểm tra khả năng truy xuất record sau phiên. */
async function completeSessionViaApi(
  request: APIRequestContext,
  accessToken: string,
  sessionId: string
): Promise<void> {
  const response = await request.patch(`${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { status: 'completed', focusedSeconds: 0 },
  });
  expect(response.status()).toBe(200);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-006: Nhập, liên kết concept và auto-save ghi chú', () => {
  test('1) UI auto-save lần đầu, cập nhật N1 và giữ bản mới nhất sau khi hoàn tất', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_006_ui');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Đăng nhập, bắt đầu phiên C1 và mở rail Ghi chú nhanh.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const session = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: { id: true },
      });
      const notesPanel = page.getByRole('complementary', {
        name: 'Ghi chú nhanh cho khái niệm Concept C1',
        exact: true,
      });
      const noteInput = notesPanel.getByLabel('Ghi chú cho khái niệm Concept C1', { exact: true });
      await expect(noteInput).toBeVisible();

      // 2. Nhập N1, chờ đúng request POST auto-save và chỉ báo Đã lưu.
      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${session.id}/notes`
      );
      await noteInput.fill(initialNote);
      expect((await createResponsePromise).status()).toBe(201);
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
      let notes = await prisma.sessionNote.findMany({ where: { sessionId: session.id } });
      expect(notes).toHaveLength(1);
      expect(notes[0]?.conceptId).toBe(conceptC1.id);
      expect(notes[0]?.body).toBe(initialNote);

      // 3. Sửa N1, chờ PATCH auto-save và xác minh không tạo hàng thứ hai/không giữ bản cũ.
      const updateResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().startsWith(`${API_BASE_URL}/api/v1/focus-sessions/${session.id}/notes/`)
      );
      await noteInput.fill(editedNote);
      expect((await updateResponsePromise).status()).toBe(200);
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
      notes = await prisma.sessionNote.findMany({ where: { sessionId: session.id } });
      expect(notes).toHaveLength(1);
      expect(notes[0]?.body).toBe(editedNote);
      expect(notes[0]?.body).not.toBe(initialNote);

      // 4. Đóng/mở rail; bản đã lưu phải nạp lại từ server trong danh sách ghi chú.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await expect(notesPanel.getByRole('listitem').filter({ hasText: editedNote })).toBeVisible();

      // 5. Đóng rail, pause và kết thúc phiên; note vẫn đọc được qua API sau khi hoàn tất.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      const listResponse = await request.get(
        `${API_BASE_URL}/api/v1/focus-sessions/${session.id}/notes`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(listResponse.status()).toBe(200);
      const listBody = (await listResponse.json()) as ApiEnvelope<CreatedNote[]>;
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0]?.body).toBe(editedNote);
    } finally {
      // 6. Cascade cleanup session và note từ User gốc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('2) API/DB lưu N1 cho C1, N2 cho C2 và chỉ giữ bản sửa cuối của N1', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_006_api');
    const conceptC1 = seed.concepts[0];
    const conceptC2 = seed.concepts[1];
    if (!conceptC1 || !conceptC2) throw new Error('Seed data is missing C1 or C2.');

    try {
      // 1. Đăng nhập qua UI và tạo phiên thật chứa C1+C2 qua API.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const sessionId = await createMultiConceptSession(request, accessToken, seed);

      // 2. Tạo N1 cho C1 rồi PATCH cùng hàng thành nội dung cuối.
      const noteN1 = await createNoteViaApi(
        request,
        accessToken,
        sessionId,
        conceptC1.id,
        initialNote
      );
      const updateResponse = await request.patch(
        `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes/${noteN1.id}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { body: editedNote },
        }
      );
      expect(updateResponse.status()).toBe(200);

      // 3. Tạo N2 độc lập và neo đúng C2.
      await createNoteViaApi(request, accessToken, sessionId, conceptC2.id, secondNote);

      // 4. Đối chiếu DB: đúng hai hàng, đúng cặp concept/body và không còn nội dung N1 cũ.
      const notes = await prisma.sessionNote.findMany({
        where: { sessionId },
        select: { conceptId: true, body: true },
      });
      expect(notes).toHaveLength(2);
      expect(notes).toEqual(
        expect.arrayContaining([
          { conceptId: conceptC1.id, body: editedNote },
          { conceptId: conceptC2.id, body: secondNote },
        ])
      );
      expect(notes.some((note) => note.body === initialNote)).toBe(false);

      // 5. Hoàn tất phiên và xác minh quan hệ note không đổi sau PATCH session.
      await completeSessionViaApi(request, accessToken, sessionId);
      const completedNotes = await prisma.sessionNote.findMany({ where: { sessionId } });
      expect(completedNotes).toHaveLength(2);
    } finally {
      // 6. Luôn dọn toàn bộ dữ liệu tích hợp.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('3) API lịch sử phiên và notes đọc lại đủ N1/N2 sau khi hoàn tất', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_006_completed');
    const conceptC1 = seed.concepts[0];
    const conceptC2 = seed.concepts[1];
    if (!conceptC1 || !conceptC2) throw new Error('Seed data is missing C1 or C2.');

    try {
      // 1. Tạo record hoàn chỉnh C1+C2 cùng hai ghi chú qua API thật.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const sessionId = await createMultiConceptSession(request, accessToken, seed);
      await createNoteViaApi(request, accessToken, sessionId, conceptC1.id, editedNote);
      await createNoteViaApi(request, accessToken, sessionId, conceptC2.id, secondNote);
      await completeSessionViaApi(request, accessToken, sessionId);

      // 2. Gọi API lịch sử phiên và tìm đúng record vừa hoàn tất cùng hai concept.
      const sessionsResponse = await request.get(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 20, offset: 0 },
      });
      expect(sessionsResponse.status()).toBe(200);
      const sessionsBody = (await sessionsResponse.json()) as ApiEnvelope<FocusSessionListItem[]>;
      const completedSession = sessionsBody.data.find((session) => session.id === sessionId);
      expect(completedSession).toBeDefined();
      expect(completedSession?.status).toBe('completed');
      expect(completedSession?.concepts).toEqual([
        { id: conceptC1.id, name: conceptC1.name },
        { id: conceptC2.id, name: conceptC2.name },
      ]);

      // 3. Gọi API notes sau hoàn tất và đối chiếu nguyên vẹn cặp concept/nội dung.
      const notesResponse = await request.get(
        `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      expect(notesResponse.status()).toBe(200);
      const notesBody = (await notesResponse.json()) as ApiEnvelope<CreatedNote[]>;
      expect(notesBody.data).toHaveLength(2);
      expect(notesBody.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ conceptId: conceptC1.id, body: editedNote }),
          expect.objectContaining({ conceptId: conceptC2.id, body: secondNote }),
        ])
      );
    } finally {
      // 4. Dọn record đã hoàn tất và notes qua cascade User.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
