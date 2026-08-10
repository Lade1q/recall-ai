import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

interface CreatedFocusSession {
  id: string;
  planId: string | null;
  conceptIds: string[];
  status: string;
  strictMode: boolean;
  startedAt: string;
}

interface EndedFocusSession {
  id: string;
  status: string;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  strictMode: boolean;
  startedAt: string;
  endedAt: string;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-003: Chọn concept hợp lệ trước khi bắt đầu', () => {
  test('a) API chặn danh sách rỗng; UI luôn có concept đầu vào hợp lệ', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_003_a');

    try {
      // 1. Đăng nhập bằng Student A qua UI thật để lấy đúng token của người dùng.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);

      // 2. Xác minh lớp backend từ chối payload không có concept và không tạo record rác.
      const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { planId: seed.plan.id, conceptIds: [] },
      });
      expect(response.status()).toBe(400);
      const responseBody = (await response.json()) as ApiErrorEnvelope;
      expect(responseBody).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input data' },
      });
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id } }))
        .toBe(0);

      // 3. Xác minh UI dùng trực tiếp concept được đề xuất, không tạo trạng thái lựa chọn rỗng.
      await page.goto('/focus');
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeEnabled();

      // 4. Không nhấn Bắt đầu và xác minh chỉ việc mở màn thiết lập không tạo record.
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id } }))
        .toBe(0);
    } finally {
      // 5. Xóa entity gốc; cascade dọn plan, concepts, queue và session nếu assertion thất bại.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Chọn riêng C1: phiên hoàn tất chỉ liên kết C1', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_003_b');

    try {
      const conceptC1 = seed.concepts[0];
      if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

      // 1. Đăng nhập và mở màn thiết lập đang đề xuất C1.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();

      // 2. Bắt response trước click, lấy đúng session ID rồi tạm dừng để số liệu ổn định.
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedFocusSession>;
      expect(startBody).toEqual({
        success: true,
        data: {
          id: expect.any(String),
          planId: seed.plan.id,
          conceptIds: [conceptC1.id],
          status: 'running',
          strictMode: expect.any(Boolean),
          startedAt: expect.any(String),
        },
      });
      const sessionId = startBody.data.id;
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();

      // 3. Đăng ký response PATCH trước thao tác kết thúc và kiểm tra cả status/body.
      const endResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      const endResponse = await endResponsePromise;
      expect(endResponse.status()).toBe(200);
      const endBody = (await endResponse.json()) as ApiEnvelope<EndedFocusSession>;
      expect(endBody).toEqual({
        success: true,
        data: {
          id: sessionId,
          status: 'completed',
          durationMinutes: 0,
          focusedSeconds: expect.any(Number),
          awayCount: 0,
          pomodorosCompleted: 0,
          strictMode: startBody.data.strictMode,
          startedAt: startBody.data.startedAt,
          endedAt: expect.any(String),
        },
      });
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();

      // 4. Đối chiếu bằng ID response: đúng owner/P1/C1 và không có session thứ hai.
      const session = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          userId: true,
          planId: true,
          status: true,
          conceptIds: true,
          focusedSeconds: true,
          strictMode: true,
        },
      });
      expect(session).toEqual({
        userId: seed.user.id,
        planId: seed.plan.id,
        status: 'completed',
        conceptIds: [conceptC1.id],
        focusedSeconds: endBody.data.focusedSeconds,
        strictMode: startBody.data.strictMode,
      });
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
    } finally {
      // 5. Luôn cleanup cả khi UI hoặc assertion DB thất bại.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('c) API lưu đủ C1, C2, C3 và loại bỏ ID trùng lặp', async ({ page, request }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_003_c_api');

    try {
      // 1. Đăng nhập qua UI để dùng đúng access token cho API tích hợp.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const conceptIds = seed.concepts.map((concept) => concept.id);

      // 2. Gửi cả ba concept và cố ý lặp C2 để xác minh backend không nhân bản dữ liệu.
      const createResponse = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          planId: seed.plan.id,
          conceptIds: [...conceptIds, conceptIds[1]],
        },
      });
      expect(createResponse.status()).toBe(201);
      const createBody = (await createResponse.json()) as ApiEnvelope<CreatedFocusSession>;
      expect(createBody).toEqual({
        success: true,
        data: {
          id: expect.any(String),
          planId: seed.plan.id,
          conceptIds,
          status: 'running',
          strictMode: false,
          startedAt: expect.any(String),
        },
      });
      const sessionId = createBody.data.id;

      // 3. Đối chiếu DB bằng ID response: tập ID giữ nguyên thứ tự và không có bản sao.
      const session = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { userId: true, planId: true, conceptIds: true, status: true },
      });
      expect(session).toEqual({
        userId: seed.user.id,
        planId: seed.plan.id,
        conceptIds,
        status: 'running',
      });

      // 4. Hoàn tất qua đúng ID, kiểm tra response body rồi xác minh DB vẫn giữ ba concept.
      const endResponse = await request.patch(
        `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { status: 'completed', focusedSeconds: 0 },
        }
      );
      expect(endResponse.status()).toBe(200);
      const endBody = (await endResponse.json()) as ApiEnvelope<EndedFocusSession>;
      expect(endBody).toEqual({
        success: true,
        data: {
          id: sessionId,
          status: 'completed',
          durationMinutes: 0,
          focusedSeconds: 0,
          awayCount: 0,
          pomodorosCompleted: 0,
          strictMode: false,
          startedAt: createBody.data.startedAt,
          endedAt: expect.any(String),
        },
      });
      const completed = await prisma.focusSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true, conceptIds: true, focusedSeconds: true },
      });
      expect(completed).toEqual({ status: 'completed', conceptIds, focusedSeconds: 0 });
    } finally {
      // 5. Luôn xóa dữ liệu seed bằng entity gốc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
