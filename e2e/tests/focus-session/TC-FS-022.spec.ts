import { expect, test, type APIResponse, type Page, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const studentAConceptName = 'Student A Secret Concept';
const studentANoteBody = 'Student A private focus note';
const studentBConceptName = 'Student B Own Concept';
const studentBNoteBody = 'Student B own focus note';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

interface FocusHistoryItem {
  id: string;
  planId: string | null;
  concepts: Array<{ id: string; name: string }>;
  status: string;
}

interface SessionNoteDto {
  id: string;
  sessionId: string;
  conceptId: string;
  body: string;
}

interface FocusSecurityDataset {
  studentA: FocusPlanSeed;
  studentB: FocusPlanSeed;
  sessionA: { id: string };
  sessionB: { id: string };
  noteA: { id: string };
  noteB: { id: string };
}

/** Seed hai owner độc lập, mỗi owner có session hoàn tất và note riêng. */
async function seedSecurityDataset(prefix: string): Promise<FocusSecurityDataset> {
  const studentA = await seedFocusPlan(prisma, `${prefix}_a`);
  let studentB: FocusPlanSeed | null = null;

  try {
    studentB = await seedFocusPlan(prisma, `${prefix}_b`);
    const conceptA = studentA.concepts[0];
    const conceptB = studentB.concepts[0];
    if (!conceptA || !conceptB) throw new Error('Security seed is missing C1 for A or B.');

    await Promise.all([
      prisma.concept.update({
        where: { id: conceptA.id },
        data: { name: studentAConceptName },
      }),
      prisma.concept.update({
        where: { id: conceptB.id },
        data: { name: studentBConceptName },
      }),
    ]);

    const now = Date.now();
    const [sessionA, sessionB] = await Promise.all([
      prisma.focusSession.create({
        data: {
          userId: studentA.user.id,
          planId: studentA.plan.id,
          conceptIds: [conceptA.id],
          status: 'completed',
          durationMinutes: 25,
          focusedSeconds: 1_500,
          pomodorosCompleted: 1,
          startedAt: new Date(now - 25 * 60 * 1_000),
          endedAt: new Date(now),
        },
        select: { id: true },
      }),
      prisma.focusSession.create({
        data: {
          userId: studentB.user.id,
          planId: studentB.plan.id,
          conceptIds: [conceptB.id],
          status: 'completed',
          durationMinutes: 10,
          focusedSeconds: 600,
          startedAt: new Date(now - 10 * 60 * 1_000),
          endedAt: new Date(now),
        },
        select: { id: true },
      }),
    ]);

    const [noteA, noteB] = await Promise.all([
      prisma.sessionNote.create({
        data: { sessionId: sessionA.id, conceptId: conceptA.id, body: studentANoteBody },
        select: { id: true },
      }),
      prisma.sessionNote.create({
        data: { sessionId: sessionB.id, conceptId: conceptB.id, body: studentBNoteBody },
        select: { id: true },
      }),
    ]);

    return { studentA, studentB, sessionA, sessionB, noteA, noteB };
  } catch (error) {
    if (studentB) await prisma.user.delete({ where: { id: studentB.user.id } });
    await prisma.user.delete({ where: { id: studentA.user.id } });
    throw error;
  }
}

/** Dọn hai owner gốc; cascade xóa toàn bộ plan/concept/session/note riêng. */
async function cleanupSecurityDataset(dataset: FocusSecurityDataset): Promise<void> {
  await prisma.user.deleteMany({
    where: { id: { in: [dataset.studentA.user.id, dataset.studentB.user.id] } },
  });
}

/** Đọc snapshot S1/N1 để chứng minh mọi request trái quyền không làm đổi dữ liệu A. */
async function readStudentAState(dataset: FocusSecurityDataset) {
  return prisma.focusSession.findUniqueOrThrow({
    where: { id: dataset.sessionA.id },
    select: {
      userId: true,
      planId: true,
      conceptIds: true,
      status: true,
      durationMinutes: true,
      focusedSeconds: true,
      endedAt: true,
      notes: {
        select: { id: true, conceptId: true, body: true, createdAt: true, updatedAt: true },
      },
    },
  });
}

/** Assertion lỗi API không được phản chiếu bất kỳ metadata bí mật nào của Student A. */
async function expectApiErrorWithoutLeak(
  response: APIResponse,
  status: number,
  code: string,
  secrets: string[]
): Promise<void> {
  expect(response.status()).toBe(status);
  const rawBody = await response.text();
  const body = JSON.parse(rawBody) as ApiErrorEnvelope;
  expect(body).toMatchObject({ success: false, error: { code } });
  for (const secret of secrets) expect(rawBody).not.toContain(secret);
}

/** Xóa auth B qua đúng event của AuthContext rồi đăng nhập A bằng form thật. */
async function reloginViaUi(page: Page, email: string): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:logout')));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
  await loginViaUi(page, email);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-022: Cô lập dữ liệu Focus Session giữa hai Student', () => {
  test('a) B không đọc/sửa/xóa được S1 hoặc N1 của A qua mọi endpoint mang ID', async ({
    page,
    request,
  }) => {
    const dataset = await seedSecurityDataset('tc_fs_022_idor');
    const stateBefore = await readStudentAState(dataset);
    const conceptA = dataset.studentA.concepts[0];
    if (!conceptA) throw new Error('Security seed is missing Student A C1.');
    const foreignApiRequests: Request[] = [];
    const captureForeignUiRequest = (uiRequest: Request) => {
      if (uiRequest.url().includes(`/focus-sessions/${dataset.sessionA.id}`)) {
        foreignApiRequests.push(uiRequest);
      }
    };

    try {
      // 1. Đăng nhập B thật; đọc note của chính B thành công để chứng minh token hợp lệ.
      await loginViaUi(page, dataset.studentB.user.email);
      const tokenB = await readAccessToken(page);
      const authorizationB = { Authorization: `Bearer ${tokenB}` };
      const ownNotesResponse = await request.get(
        `${API_BASE_URL}/api/v1/focus-sessions/${dataset.sessionB.id}/notes`,
        { headers: authorizationB }
      );
      expect(ownNotesResponse.status()).toBe(200);
      const ownNotes = (await ownNotesResponse.json()) as ApiEnvelope<SessionNoteDto[]>;
      expect(ownNotes.data).toEqual([
        expect.objectContaining({ id: dataset.noteB.id, body: studentBNoteBody }),
      ]);

      // 2. Thay S1 vào URL UI: app trả trang 404, không gọi API và không render bí mật của A.
      page.on('request', captureForeignUiRequest);
      await page.goto(`/history/${dataset.sessionA.id}`);
      await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
      await expect(page.getByText('Trang không tồn tại.', { exact: true })).toBeVisible();
      await expect(page.getByText(studentAConceptName, { exact: true })).toHaveCount(0);
      await expect(page.getByText(studentANoteBody, { exact: true })).toHaveCount(0);
      expect(foreignApiRequests).toHaveLength(0);

      const sessionUrl = `${API_BASE_URL}/api/v1/focus-sessions/${dataset.sessionA.id}`;
      const notesUrl = `${sessionUrl}/notes`;
      const noteUrl = `${notesUrl}/${dataset.noteA.id}`;
      const secrets = [studentAConceptName, studentANoteBody];

      // 3. GET detail chưa có route; GET notes của S1 có route nhưng phải gộp ownership thành 404.
      const missingDetailResponse = await request.get(sessionUrl, { headers: authorizationB });
      expect(missingDetailResponse.status()).toBe(404);
      const missingDetailBody = await missingDetailResponse.text();
      for (const secret of secrets) expect(missingDetailBody).not.toContain(secret);
      await expectApiErrorWithoutLeak(
        await request.get(notesUrl, { headers: authorizationB }),
        404,
        'NOT_FOUND',
        secrets
      );

      // 4. B không thể kết thúc S1 hoặc tạo/sửa/xóa N1 khi dùng trực tiếp ID của A.
      await expectApiErrorWithoutLeak(
        await request.patch(sessionUrl, {
          headers: authorizationB,
          data: { status: 'completed', focusedSeconds: 0 },
        }),
        404,
        'NOT_FOUND',
        secrets
      );
      await expectApiErrorWithoutLeak(
        await request.post(notesUrl, {
          headers: authorizationB,
          data: { conceptId: conceptA.id, body: 'B attempted to inject a note' },
        }),
        404,
        'NOT_FOUND',
        secrets
      );
      await expectApiErrorWithoutLeak(
        await request.patch(noteUrl, {
          headers: authorizationB,
          data: { body: 'B attempted to overwrite N1' },
        }),
        404,
        'NOT_FOUND',
        secrets
      );
      await expectApiErrorWithoutLeak(
        await request.delete(noteUrl, { headers: authorizationB }),
        404,
        'NOT_FOUND',
        secrets
      );

      // 5. Ngay cả khi dùng session B hợp lệ nhưng nhét noteId A, PATCH/DELETE vẫn phải 404.
      const foreignNoteUnderOwnedSession = `${API_BASE_URL}/api/v1/focus-sessions/${dataset.sessionB.id}/notes/${dataset.noteA.id}`;
      await expectApiErrorWithoutLeak(
        await request.patch(foreignNoteUnderOwnedSession, {
          headers: authorizationB,
          data: { body: 'Cross-session overwrite attempt' },
        }),
        404,
        'NOT_FOUND',
        secrets
      );
      await expectApiErrorWithoutLeak(
        await request.delete(foreignNoteUnderOwnedSession, { headers: authorizationB }),
        404,
        'NOT_FOUND',
        secrets
      );

      // 6. Re-login A, đọc lại history/notes thật và đối chiếu toàn bộ S1/N1 với snapshot ban đầu.
      await reloginViaUi(page, dataset.studentA.user.email);
      const tokenA = await readAccessToken(page);
      const authorizationA = { Authorization: `Bearer ${tokenA}` };
      const historyResponse = await request.get(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: authorizationA,
      });
      expect(historyResponse.status()).toBe(200);
      const history = (await historyResponse.json()) as ApiEnvelope<FocusHistoryItem[]>;
      expect(history.data).toEqual([
        expect.objectContaining({
          id: dataset.sessionA.id,
          planId: dataset.studentA.plan.id,
          concepts: [{ id: conceptA.id, name: studentAConceptName }],
          status: 'completed',
        }),
      ]);
      const notesResponse = await request.get(notesUrl, { headers: authorizationA });
      expect(notesResponse.status()).toBe(200);
      const notes = (await notesResponse.json()) as ApiEnvelope<SessionNoteDto[]>;
      expect(notes.data).toEqual([
        expect.objectContaining({
          id: dataset.noteA.id,
          sessionId: dataset.sessionA.id,
          conceptId: conceptA.id,
          body: studentANoteBody,
        }),
      ]);
      expect(await readStudentAState(dataset)).toEqual(stateBefore);
    } finally {
      // 7. Tháo listener và dọn cascade cả hai owner dù một assertion security thất bại.
      page.off('request', captureForeignUiRequest);
      await cleanupSecurityDataset(dataset);
    }
  });

  test('b) B không tạo được session dùng plan hoặc concept thuộc A', async ({ page, request }) => {
    const dataset = await seedSecurityDataset('tc_fs_022_create');
    const stateBefore = await readStudentAState(dataset);
    const conceptA = dataset.studentA.concepts[0];
    const conceptB = dataset.studentB.concepts[0];
    if (!conceptA || !conceptB) throw new Error('Security seed is missing A/B concepts.');

    try {
      // 1. Đăng nhập B và chụp số record/plan A trước mọi create attempt.
      await loginViaUi(page, dataset.studentB.user.email);
      const tokenB = await readAccessToken(page);
      const authorizationB = { Authorization: `Bearer ${tokenB}` };
      const sessionCountBefore = await prisma.focusSession.count({
        where: { userId: dataset.studentB.user.id },
      });
      const planABefore = await prisma.studyPlan.findUniqueOrThrow({
        where: { id: dataset.studentA.plan.id },
        select: { status: true, updatedAt: true, _count: { select: { focusSessions: true } } },
      });

      // 2. Foreign plan + foreign concept phải 404, không xác nhận P1 của A tồn tại.
      await expectApiErrorWithoutLeak(
        await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
          headers: authorizationB,
          data: { planId: dataset.studentA.plan.id, conceptIds: [conceptA.id] },
        }),
        404,
        'NOT_FOUND',
        [studentAConceptName, studentANoteBody]
      );

      // 3. Plan B hợp lệ nhưng concept A phải 400 INVALID_CONCEPT_IDS, không tạo JSON reference lạ.
      await expectApiErrorWithoutLeak(
        await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
          headers: authorizationB,
          data: { planId: dataset.studentB.plan.id, conceptIds: [conceptA.id] },
        }),
        400,
        'INVALID_CONCEPT_IDS',
        [studentAConceptName, studentANoteBody]
      );

      // 4. Foreign plan vẫn 404 cả khi B dùng concept của chính mình để dò plan ID.
      await expectApiErrorWithoutLeak(
        await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
          headers: authorizationB,
          data: { planId: dataset.studentA.plan.id, conceptIds: [conceptB.id] },
        }),
        404,
        'NOT_FOUND',
        [studentAConceptName, studentANoteBody]
      );

      // 5. Không request nào tạo thêm session hoặc thay đổi plan/S1/N1 của A.
      expect(await prisma.focusSession.count({ where: { userId: dataset.studentB.user.id } })).toBe(
        sessionCountBefore
      );
      expect(
        await prisma.studyPlan.findUniqueOrThrow({
          where: { id: dataset.studentA.plan.id },
          select: { status: true, updatedAt: true, _count: { select: { focusSessions: true } } },
        })
      ).toEqual(planABefore);
      expect(await readStudentAState(dataset)).toEqual(stateBefore);
    } finally {
      // 6. Cascade cleanup dữ liệu A/B.
      await cleanupSecurityDataset(dataset);
    }
  });

  test('c) History và notes của B chỉ trả record thuộc B, không rò metadata A', async ({
    page,
    request,
  }) => {
    const dataset = await seedSecurityDataset('tc_fs_022_history');
    const conceptB = dataset.studentB.concepts[0];
    if (!conceptB) throw new Error('Security seed is missing Student B C1.');

    try {
      // 1. Đăng nhập B và gọi endpoint history thật với phân trang rộng.
      await loginViaUi(page, dataset.studentB.user.email);
      const tokenB = await readAccessToken(page);
      const authorizationB = { Authorization: `Bearer ${tokenB}` };
      const historyResponse = await request.get(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: authorizationB,
        params: { limit: 50, offset: 0 },
      });
      expect(historyResponse.status()).toBe(200);
      const rawHistory = await historyResponse.text();
      const history = JSON.parse(rawHistory) as ApiEnvelope<FocusHistoryItem[]>;

      // 2. Chỉ S2/concept B xuất hiện; không có ID, tên concept hoặc note của A.
      expect(history.data).toEqual([
        expect.objectContaining({
          id: dataset.sessionB.id,
          planId: dataset.studentB.plan.id,
          concepts: [{ id: conceptB.id, name: studentBConceptName }],
          status: 'completed',
        }),
      ]);
      for (const secret of [
        dataset.sessionA.id,
        dataset.noteA.id,
        studentAConceptName,
        studentANoteBody,
      ]) {
        expect(rawHistory).not.toContain(secret);
      }

      // 3. Notes của session B chỉ trả N2 và không trộn note từ session A.
      const ownNotesResponse = await request.get(
        `${API_BASE_URL}/api/v1/focus-sessions/${dataset.sessionB.id}/notes`,
        { headers: authorizationB }
      );
      expect(ownNotesResponse.status()).toBe(200);
      const ownNotesRaw = await ownNotesResponse.text();
      const ownNotes = JSON.parse(ownNotesRaw) as ApiEnvelope<SessionNoteDto[]>;
      expect(ownNotes.data).toEqual([
        expect.objectContaining({
          id: dataset.noteB.id,
          sessionId: dataset.sessionB.id,
          conceptId: conceptB.id,
          body: studentBNoteBody,
        }),
      ]);
      expect(ownNotesRaw).not.toContain(dataset.noteA.id);
      expect(ownNotesRaw).not.toContain(studentANoteBody);

      // 4. Đối chiếu DB cuối: mỗi owner vẫn có đúng một session/note, không trộn khóa ngoại.
      expect(await prisma.focusSession.count({ where: { userId: dataset.studentA.user.id } })).toBe(
        1
      );
      expect(await prisma.focusSession.count({ where: { userId: dataset.studentB.user.id } })).toBe(
        1
      );
      expect(
        await prisma.sessionNote.count({ where: { session: { userId: dataset.studentA.user.id } } })
      ).toBe(1);
      expect(
        await prisma.sessionNote.count({ where: { session: { userId: dataset.studentB.user.id } } })
      ).toBe(1);
    } finally {
      // 5. Cascade cleanup cả hai owner.
      await cleanupSecurityDataset(dataset);
    }
  });
});
