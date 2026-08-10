import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const dayMs = 24 * 60 * 60 * 1_000;
const vnOffsetMs = 7 * 60 * 60 * 1_000;

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface FocusHistoryItem {
  id: string;
  planId: string | null;
  concepts: Array<{ id: string; name: string }>;
  status: string;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  strictMode: boolean;
  startedAt: string;
  endedAt: string | null;
}

interface HistoryDataset {
  studentA: FocusPlanSeed;
  studentB: FocusPlanSeed;
  sessions: {
    s1: { id: string };
    s2: { id: string };
    s3: { id: string };
    s4: { id: string };
    studentB: { id: string };
  };
  sevenDayStart: Date;
  todayKey: string;
}

/** Khóa ngày yyyy-mm-dd theo Asia/Ho_Chi_Minh mà không phụ thuộc TZ của process test. */
function toVnDayKey(date: Date): string {
  return new Date(date.getTime() + vnOffsetMs).toISOString().slice(0, 10);
}

/** Mốc 00:00 giờ Việt Nam của một ngày, trả về UTC Date. */
function vnStartOfDay(date: Date): Date {
  return new Date(`${toVnDayKey(date)}T00:00:00+07:00`);
}

/** Seed bốn phiên của Student A và một phiên bí mật của B bằng DB thật. */
async function seedHistoryDataset(prefix: string): Promise<HistoryDataset> {
  const studentA = await seedFocusPlan(prisma, `${prefix}_a`);
  let studentB: FocusPlanSeed | null = null;

  try {
    studentB = await seedFocusPlan(prisma, `${prefix}_b`);
    const [c1, c2, c3] = studentA.concepts;
    const studentBConcept = studentB.concepts[0];
    if (!c1 || !c2 || !c3 || !studentBConcept) {
      throw new Error('History seed is missing required concepts.');
    }
    await prisma.concept.update({
      where: { id: studentBConcept.id },
      data: { name: 'Student B Secret Concept' },
    });

    const now = new Date();
    const todayStart = vnStartOfDay(now);
    const sevenDayStart = new Date(todayStart.getTime() - 6 * dayMs);
    const threeDaysAgo = new Date(todayStart.getTime() - 3 * dayMs + 9 * 60 * 60 * 1_000);
    const eightDaysAgo = new Date(todayStart.getTime() - 8 * dayMs + 9 * 60 * 60 * 1_000);
    const todayMinute = (minute: number) => new Date(todayStart.getTime() + minute * 60 * 1_000);

    const [s1, s2, s3, s4, studentBSession] = await Promise.all([
      prisma.focusSession.create({
        data: {
          userId: studentA.user.id,
          planId: studentA.plan.id,
          conceptIds: [c1.id],
          status: 'completed',
          durationMinutes: 25,
          focusedSeconds: 1_500,
          pomodorosCompleted: 1,
          strictMode: true,
          startedAt: todayMinute(1),
          endedAt: todayMinute(26),
        },
        select: { id: true },
      }),
      prisma.focusSession.create({
        data: {
          userId: studentA.user.id,
          planId: studentA.plan.id,
          conceptIds: [c2.id],
          status: 'completed',
          durationMinutes: 10,
          focusedSeconds: 600,
          pomodorosCompleted: 0,
          strictMode: false,
          startedAt: todayMinute(2),
          endedAt: todayMinute(12),
        },
        select: { id: true },
      }),
      prisma.focusSession.create({
        data: {
          userId: studentA.user.id,
          planId: studentA.plan.id,
          conceptIds: [c1.id, c3.id],
          status: 'completed',
          durationMinutes: 25,
          focusedSeconds: 1_500,
          pomodorosCompleted: 1,
          strictMode: true,
          startedAt: threeDaysAgo,
          endedAt: new Date(threeDaysAgo.getTime() + 25 * 60 * 1_000),
        },
        select: { id: true },
      }),
      prisma.focusSession.create({
        data: {
          userId: studentA.user.id,
          planId: studentA.plan.id,
          conceptIds: [c2.id],
          status: 'completed',
          durationMinutes: 20,
          focusedSeconds: 1_200,
          pomodorosCompleted: 1,
          strictMode: false,
          startedAt: eightDaysAgo,
          endedAt: new Date(eightDaysAgo.getTime() + 20 * 60 * 1_000),
        },
        select: { id: true },
      }),
      prisma.focusSession.create({
        data: {
          userId: studentB.user.id,
          planId: studentB.plan.id,
          conceptIds: [studentBConcept.id],
          status: 'completed',
          durationMinutes: 99,
          focusedSeconds: 5_940,
          pomodorosCompleted: 9,
          startedAt: todayMinute(3),
          endedAt: todayMinute(102),
        },
        select: { id: true },
      }),
    ]);

    return {
      studentA,
      studentB,
      sessions: { s1, s2, s3, s4, studentB: studentBSession },
      sevenDayStart,
      todayKey: toVnDayKey(now),
    };
  } catch (error) {
    if (studentB) await prisma.user.delete({ where: { id: studentB.user.id } });
    await prisma.user.delete({ where: { id: studentA.user.id } });
    throw error;
  }
}

/** Đọc endpoint lịch sử thật bằng token của Student A. */
async function readHistory(
  request: APIRequestContext,
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<FocusHistoryItem[]> {
  const response = await request.get(`${API_BASE_URL}/api/v1/focus-sessions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { limit, offset },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as ApiEnvelope<FocusHistoryItem[]>;
  return body.data;
}

/** Dọn cả hai owner; mỗi User cascade toàn bộ session/plan/concept riêng. */
async function cleanupHistoryDataset(dataset: HistoryDataset): Promise<void> {
  await prisma.user.deleteMany({
    where: { id: { in: [dataset.studentA.user.id, dataset.studentB.user.id] } },
  });
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-017: Lịch sử Focus theo ngày/7 ngày và thống kê tổng hợp', () => {
  test('1) API/DB trả đúng S1–S4, phân trang, thứ tự và cô lập Student B', async ({
    page,
    request,
  }) => {
    const dataset = await seedHistoryDataset('tc_fs_017_api');

    try {
      // 1. Đăng nhập Student A và gọi endpoint lịch sử backend thật.
      await loginViaUi(page, dataset.studentA.user.email);
      const accessToken = await readAccessToken(page);
      const history = await readHistory(request, accessToken);

      // 2. API chỉ trả bốn phiên của A, mới nhất trước; không rò ID/concept bí mật của B.
      expect(history.map((session) => session.id)).toEqual([
        dataset.sessions.s2.id,
        dataset.sessions.s1.id,
        dataset.sessions.s3.id,
        dataset.sessions.s4.id,
      ]);
      expect(history.some((session) => session.id === dataset.sessions.studentB.id)).toBe(false);
      expect(
        history.flatMap((session) => session.concepts.map((concept) => concept.name))
      ).not.toContain('Student B Secret Concept');

      // 3. Mỗi row giữ đúng duration/Pomodoro/concept, gồm phiên đa concept C1+C3.
      const s1 = history.find((session) => session.id === dataset.sessions.s1.id);
      const s2 = history.find((session) => session.id === dataset.sessions.s2.id);
      const s3 = history.find((session) => session.id === dataset.sessions.s3.id);
      expect(s1).toMatchObject({
        status: 'completed',
        durationMinutes: 25,
        focusedSeconds: 1_500,
        pomodorosCompleted: 1,
        strictMode: true,
      });
      expect(s1?.concepts).toEqual([{ id: dataset.studentA.concepts[0]?.id, name: 'Concept C1' }]);
      expect(s2).toMatchObject({ durationMinutes: 10, pomodorosCompleted: 0, strictMode: false });
      expect(s3?.concepts).toEqual([
        { id: dataset.studentA.concepts[0]?.id, name: 'Concept C1' },
        { id: dataset.studentA.concepts[2]?.id, name: 'Concept C3' },
      ]);

      // 4. Từ payload thô, thống kê đặc tả dẫn xuất đúng: hôm nay 35, 7 ngày 60, 2 Pomodoro.
      const todaySessions = history.filter(
        (session) => toVnDayKey(new Date(session.startedAt)) === dataset.todayKey
      );
      const sevenDaySessions = history.filter(
        (session) => new Date(session.startedAt).getTime() >= dataset.sevenDayStart.getTime()
      );
      expect(todaySessions.reduce((sum, session) => sum + session.durationMinutes, 0)).toBe(35);
      expect(sevenDaySessions.reduce((sum, session) => sum + session.durationMinutes, 0)).toBe(60);
      expect(sevenDaySessions.reduce((sum, session) => sum + session.pomodorosCompleted, 0)).toBe(
        2
      );
      expect(
        new Set(
          sevenDaySessions.flatMap((session) => session.concepts.map((concept) => concept.name))
        )
      ).toEqual(new Set(['Concept C1', 'Concept C2', 'Concept C3']));

      // 5. limit/offset hoạt động ổn định trên cùng thứ tự mới nhất-trước.
      const secondPage = await readHistory(request, accessToken, 2, 1);
      expect(secondPage.map((session) => session.id)).toEqual([
        dataset.sessions.s1.id,
        dataset.sessions.s3.id,
      ]);
    } finally {
      // 6. Dọn dữ liệu của cả Student A và B dù assertion ownership thất bại.
      await cleanupHistoryDataset(dataset);
    }
  });

  test('2) UI /history phải tải API, hiển thị tab Focus, phạm vi và thống kê S1–S3', async ({
    page,
  }) => {
    const dataset = await seedHistoryDataset('tc_fs_017_ui');
    let historyRequests = 0;
    const countHistoryRequest = (request: Request) => {
      if (
        request.method() === 'GET' &&
        request.url().startsWith(`${API_BASE_URL}/api/v1/focus-sessions`)
      ) {
        historyRequests += 1;
      }
    };
    page.on('request', countHistoryRequest);

    try {
      // 1. Đăng nhập và đi bằng mục sidebar thật tới Lịch sử & Tiến độ.
      await loginViaUi(page, dataset.studentA.user.email);
      await page.getByRole('link', { name: 'Lịch sử & Tiến độ', exact: true }).click();
      await expect(page).toHaveURL(/\/history$/);
      await expect(
        page.getByRole('heading', { name: 'Lịch sử & Tiến độ', exact: true })
      ).toBeVisible();

      // 2. HistoryPage phải tích hợp endpoint thay vì chỉ render placeholder “Sắp ra mắt”.
      await expect
        .poll(() => historyRequests, {
          timeout: 4_000,
          message: 'Chưa implement HistoryPage gọi GET /focus-sessions',
        })
        .toBeGreaterThan(0);
      await expect(page.getByText('Sắp ra mắt.', { exact: true })).toHaveCount(0);

      // 3. Tab Phiên học và hai phạm vi phải hiển thị tổng đúng theo dữ liệu S1–S3.
      await page.getByRole('tab', { name: 'Phiên học', exact: true }).click();
      const todaySummary = page.getByText('Hôm nay', { exact: true }).locator('..');
      const sevenDaySummary = page.getByText('7 ngày', { exact: true }).locator('..');
      await expect(todaySummary).toContainText('35 phút');
      await expect(sevenDaySummary).toContainText('60 phút');
      await expect(page.getByText(/2\s+Pomodoro/i)).toBeVisible();

      // 4. Danh sách có C1/C2/C3 của A, không lộ session/concept của Student B.
      await expect(page.getByText('Concept C1', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Concept C2', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Concept C3', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Student B Secret Concept', { exact: true })).toHaveCount(0);
    } finally {
      // 5. Tháo listener và cascade cleanup cả hai owner.
      page.off('request', countHistoryRequest);
      await cleanupHistoryDataset(dataset);
    }
  });
});
