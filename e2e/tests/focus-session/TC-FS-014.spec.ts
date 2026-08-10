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
const uiNote = 'Ghi chú C1 được giữ lại khi hoàn tất phiên học';
const conceptC1Note = 'N1: Ôn lại định nghĩa của C1';
const conceptC2Note = 'N2: So sánh C2 với C1';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface DashboardStats {
  weeklyStudyMinutes: number;
}

interface CreatedSession {
  id: string;
}

interface EndedSession {
  id: string;
  status: string;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  startedAt: string;
  endedAt: string;
}

/** Đọc thống kê Dashboard qua endpoint thật của đúng Student. */
async function readDashboardStats(
  request: APIRequestContext,
  accessToken: string
): Promise<DashboardStats> {
  const response = await request.get(`${API_BASE_URL}/api/v1/dashboard/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as ApiEnvelope<DashboardStats>;
  return body.data;
}

/** Tạo phiên thật cho một hoặc nhiều concept qua contract backend hiện hành. */
async function createSessionViaApi(
  request: APIRequestContext,
  accessToken: string,
  seed: FocusPlanSeed,
  conceptIds: string[]
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { planId: seed.plan.id, conceptIds },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as ApiEnvelope<CreatedSession>;
  return body.data.id;
}

/** Gắn một ghi chú vào đúng concept của phiên bằng API thật. */
async function createNoteViaApi(
  request: APIRequestContext,
  accessToken: string,
  sessionId: string,
  conceptId: string,
  body: string
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { conceptId, body },
  });
  expect(response.status()).toBe(201);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-014: Hoàn tất phiên lưu record và cập nhật thống kê học tập', () => {
  test('1) UI lưu đủ phiên/note, tăng thống kê Dashboard và không đổi mastery', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_014_ui');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const originalLastTestedAt = new Date('2026-07-01T03:00:00.000Z');

    try {
      // 1. Chuẩn bị một Pomodoro 1 phút cùng mastery/lastTested đã biết trước phiên.
      await prisma.user.update({
        where: { id: seed.user.id },
        data: {
          pomodoroConfig: {
            work: 1,
            short_break: 1,
            long_break: 1,
            cycles: 1,
            sound: false,
          },
        },
      });
      await prisma.concept.update({
        where: { id: conceptC1.id },
        data: { masteryScore: 0.37, lastTestedAt: originalLastTestedAt },
      });
      await prisma.concept.updateMany({
        where: { planId: seed.plan.id, id: { not: conceptC1.id } },
        data: { masteryScore: 0.9 },
      });
      const queueBefore = await prisma.reviewQueueItem.findMany({
        where: { planId: seed.plan.id },
        orderBy: { id: 'asc' },
        select: { id: true, status: true, scheduledFor: true },
      });

      // 2. Đăng nhập, đọc baseline thống kê rồi bắt đầu phiên C1 từ UI.
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const statsBefore = await readDashboardStats(request, accessToken);
      await page.goto('/focus');
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startedBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
      const session = { id: startedBody.data.id };

      // 3. Backdate mốc DB để server chấp nhận 60 giây do clock trình duyệt tăng tốc.
      await prisma.focusSession.update({
        where: { id: session.id },
        data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
      });

      // 4. Nhập ghi chú, chờ auto-save thật rồi để Pomodoro chạy hết.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const noteResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${session.id}/notes`
      );
      await page.getByLabel('Ghi chú cho khái niệm Concept C1', { exact: true }).fill(uiNote);
      await page.clock.runFor(900);
      expect((await noteResponsePromise).status()).toBe(201);
      await expect(page.getByRole('complementary').getByRole('status')).toHaveText(/^Đã lưu/);
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await page.clock.runFor(60_000);

      // 5. Xác nhận kết thúc và đối chiếu payload tổng kết mà backend trả về.
      const endResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${session.id}`
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      const endResponse = await endResponsePromise;
      expect(endResponse.status()).toBe(200);
      const endedBody = (await endResponse.json()) as ApiEnvelope<EndedSession>;
      expect(endedBody.data).toMatchObject({
        id: session.id,
        status: 'completed',
        durationMinutes: 1,
        focusedSeconds: 60,
        awayCount: 0,
        pomodorosCompleted: 1,
      });
      expect(new Date(endedBody.data.endedAt).getTime()).toBeGreaterThan(
        new Date(endedBody.data.startedAt).getTime()
      );

      // 6. UI hiện tổng kết đầy đủ và hai lựa chọn tiếp theo theo basic flow.
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      await expect(page.getByText('01:00', { exact: true })).toBeVisible();
      await expect(page.getByText('1/1', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Bắt đầu kiểm tra', exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Để sau — về Dashboard', exact: true })
      ).toBeVisible();

      // 7. DB giữ đủ owner/concept/mốc giờ/T/note; Dashboard dẫn xuất thêm đúng 1 phút.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: session.id },
        select: {
          userId: true,
          planId: true,
          conceptIds: true,
          status: true,
          startedAt: true,
          endedAt: true,
          focusedSeconds: true,
          durationMinutes: true,
          notes: { select: { conceptId: true, body: true } },
        },
      });
      expect(completed).toMatchObject({
        userId: seed.user.id,
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
        status: 'completed',
        focusedSeconds: 60,
        durationMinutes: 1,
        notes: [{ conceptId: conceptC1.id, body: uiNote }],
      });
      expect(completed.endedAt).not.toBeNull();
      expect(completed.endedAt?.getTime()).toBeGreaterThan(completed.startedAt.getTime());
      const statsAfter = await readDashboardStats(request, accessToken);
      expect(statsAfter.weeklyStudyMinutes).toBe(statsBefore.weeklyStudyMinutes + 1);

      // 8. Focus completion tuyệt đối không ghi mastery/lastTested và không sửa review queue.
      const conceptAfter = await prisma.concept.findUniqueOrThrow({
        where: { id: conceptC1.id },
        select: { masteryScore: true, lastTestedAt: true },
      });
      expect(conceptAfter.masteryScore).toBe(0.37);
      expect(conceptAfter.lastTestedAt?.toISOString()).toBe(originalLastTestedAt.toISOString());
      expect(
        await prisma.reviewQueueItem.findMany({
          where: { planId: seed.plan.id },
          orderBy: { id: 'asc' },
          select: { id: true, status: true, scheduledFor: true },
        })
      ).toEqual(queueBefore);
    } finally {
      // 9. Cascade cleanup toàn bộ phiên, note, queue, concepts và plan.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('2) API/DB đa concept phải cập nhật totalStudyTime và sessionCount qua SRE', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_014_sre');
    const conceptC1 = seed.concepts[0];
    const conceptC2 = seed.concepts[1];
    if (!conceptC1 || !conceptC2) throw new Error('Seed data is missing C1 or C2.');
    const c1LastTestedAt = new Date('2026-06-10T03:00:00.000Z');
    const c2LastTestedAt = new Date('2026-06-20T03:00:00.000Z');

    try {
      // 1. Neo giá trị mastery/lastTested trước phiên rồi đăng nhập lấy token thật.
      await prisma.concept.update({
        where: { id: conceptC1.id },
        data: { masteryScore: 0.25, lastTestedAt: c1LastTestedAt },
      });
      await prisma.concept.update({
        where: { id: conceptC2.id },
        data: { masteryScore: 0.75, lastTestedAt: c2LastTestedAt },
      });
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const statsBefore = await readDashboardStats(request, accessToken);

      // 2. Tạo phiên C1+C2 thật, gắn N1/N2 và backdate đủ để ghi nhận T = 2 phút.
      const sessionId = await createSessionViaApi(request, accessToken, seed, [
        conceptC1.id,
        conceptC2.id,
      ]);
      await createNoteViaApi(request, accessToken, sessionId, conceptC1.id, conceptC1Note);
      await createNoteViaApi(request, accessToken, sessionId, conceptC2.id, conceptC2Note);
      await prisma.focusSession.update({
        where: { id: sessionId },
        data: { startedAt: new Date(Date.now() - 3 * 60 * 1_000) },
      });

      // 3. Hoàn tất qua API thật với số liệu client tổng kết, không gọi service trực tiếp.
      const endResponse = await request.patch(
        `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            status: 'completed',
            focusedSeconds: 120,
            awayCount: 1,
            pomodorosCompleted: 2,
          },
        }
      );
      expect(endResponse.status()).toBe(200);

      // 4. Record đa concept giữ đủ owner, mốc giờ, T, metrics và hai ghi chú liên kết.
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          userId: true,
          planId: true,
          conceptIds: true,
          status: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
          focusedSeconds: true,
          awayCount: true,
          pomodorosCompleted: true,
          notes: { orderBy: { conceptId: 'asc' }, select: { conceptId: true, body: true } },
        },
      });
      expect(completed).toMatchObject({
        userId: seed.user.id,
        planId: seed.plan.id,
        conceptIds: [conceptC1.id, conceptC2.id],
        status: 'completed',
        durationMinutes: 2,
        focusedSeconds: 120,
        awayCount: 1,
        pomodorosCompleted: 2,
      });
      expect(completed.endedAt).not.toBeNull();
      expect(completed.endedAt?.getTime()).toBeGreaterThan(completed.startedAt.getTime());
      expect(completed.notes).toEqual(
        [
          { conceptId: conceptC1.id, body: conceptC1Note },
          { conceptId: conceptC2.id, body: conceptC2Note },
        ].sort((left, right) => left.conceptId.localeCompare(right.conceptId))
      );

      // 5. Phần thống kê đã implement hiện tại được dẫn xuất từ record completed duy nhất.
      const statsAfter = await readDashboardStats(request, accessToken);
      expect(statsAfter.weeklyStudyMinutes).toBe(statsBefore.weeklyStudyMinutes + 2);
      expect(
        await prisma.focusSession.count({ where: { userId: seed.user.id, status: 'completed' } })
      ).toBe(1);

      // 6. Hai concept vẫn giữ nguyên dữ liệu đánh giá chỉ thuộc quyền AI Examiner.
      const conceptsAfter = await prisma.concept.findMany({
        where: { id: { in: [conceptC1.id, conceptC2.id] } },
        orderBy: { id: 'asc' },
        select: { id: true, masteryScore: true, lastTestedAt: true },
      });
      expect(conceptsAfter).toEqual(
        [
          { id: conceptC1.id, masteryScore: 0.25, lastTestedAt: c1LastTestedAt },
          { id: conceptC2.id, masteryScore: 0.75, lastTestedAt: c2LastTestedAt },
        ].sort((left, right) => left.id.localeCompare(right.id))
      );

      // 7. Contract FS-01 còn thiếu: SRE phải có counter bền vững cho từng concept.
      const counterColumns = await prisma.$queryRaw<Array<{ columnName: string }>>`
        SELECT column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'concepts'
          AND column_name IN ('total_study_time', 'session_count')
        ORDER BY column_name
      `;
      expect(
        counterColumns.map((column) => column.columnName),
        'FS-01 bước 10–11 chưa implement message tới SRE và counter totalStudyTime/sessionCount'
      ).toEqual(['session_count', 'total_study_time']);

      // 8. Khi schema/SRE được bổ sung, cả C1 và C2 phải tăng đúng 1 phiên và T = 2 phút.
      const counters = await prisma.$queryRaw<
        Array<{ id: string; totalStudyTime: number; sessionCount: number }>
      >`
        SELECT
          id::text AS id,
          total_study_time AS "totalStudyTime",
          session_count AS "sessionCount"
        FROM concepts
        WHERE id IN (${conceptC1.id}::uuid, ${conceptC2.id}::uuid)
        ORDER BY id
      `;
      expect(counters).toEqual(
        [
          { id: conceptC1.id, totalStudyTime: 2, sessionCount: 1 },
          { id: conceptC2.id, totalStudyTime: 2, sessionCount: 1 },
        ].sort((left, right) => left.id.localeCompare(right.id))
      );
    } finally {
      // 9. Cascade cleanup dữ liệu của subtest dù assertion thiếu feature thất bại.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
