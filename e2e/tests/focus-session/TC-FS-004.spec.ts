import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedFocusSession {
  id: string;
  planId: string | null;
  conceptIds: string[];
  status: 'running';
  strictMode: boolean;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-004: Bắt đầu phiên Pomodoro và contract tạo session', () => {
  test('a) API từ chối conceptIds rỗng và không tạo record', async ({ page, request }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_004_empty');

    try {
      // 1. Đăng nhập qua UI để dùng token thật của Student A cho integration request.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);

      // 2. Gửi payload rỗng tới đúng endpoint Start; validation phải chặn trước persistence.
      const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { planId: seed.plan.id, conceptIds: [], strictMode: true },
      });
      expect(response.status()).toBe(400);
      const body = (await response.json()) as {
        success: false;
        error: { code: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) UI Start tạo đúng một session C1 cho cả Strict Mode bật và tắt', async ({ page }) => {
    for (const strictMode of [true, false]) {
      const seed = await seedFocusPlan(
        prisma,
        strictMode ? 'tc_fs_004_strict_on' : 'tc_fs_004_strict_off'
      );
      const conceptC1 = seed.concepts[0];
      if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
      let createRequests = 0;
      const countCreateRequest = (request: { method(): string; url(): string }) => {
        if (
          request.method() === 'POST' &&
          new URL(request.url()).pathname === '/api/v1/focus-sessions'
        ) {
          createRequests += 1;
        }
      };
      page.on('request', countCreateRequest);

      try {
        // 1. Mở state Chưa bắt đầu; trước Start chưa có timer, request hay record.
        await loginViaUi(page, seed.user.email);
        await page.goto('/focus');
        const strictSwitch = page.getByRole('switch', {
          name: 'Chế độ nghiêm ngặt',
          exact: true,
        });
        const currentStrictMode = (await strictSwitch.getAttribute('aria-checked')) === 'true';
        if (currentStrictMode !== strictMode) await strictSwitch.click();
        await expect(strictSwitch).toHaveAttribute('aria-checked', String(strictMode));
        await expect(page.getByRole('timer')).toHaveCount(0);
        expect(createRequests).toBe(0);
        expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);

        // 2. Gắn listener trước click, rồi kiểm tra request/response thật của thao tác Start.
        const responsePromise = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/api/v1/focus-sessions'
        );
        await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(201);
        const requestPayload = response.request().postDataJSON() as {
          planId: string;
          conceptIds: string[];
          strictMode: boolean;
        };
        expect(requestPayload).toEqual({
          planId: seed.plan.id,
          conceptIds: [conceptC1.id],
          strictMode,
        });
        const body = (await response.json()) as ApiEnvelope<CreatedFocusSession>;
        expect(body.success).toBe(true);
        expect(body.data).toMatchObject({
          planId: seed.plan.id,
          conceptIds: [conceptC1.id],
          status: 'running',
          strictMode,
        });
        expect(createRequests).toBe(1);

        // 3. Dùng ID response để đối chiếu DB và xác minh timer đã bắt đầu đếm.
        const session = await prisma.focusSession.findUniqueOrThrow({
          where: { id: body.data.id },
          select: {
            userId: true,
            planId: true,
            conceptIds: true,
            status: true,
            strictMode: true,
          },
        });
        expect(session).toEqual({
          userId: seed.user.id,
          planId: seed.plan.id,
          conceptIds: [conceptC1.id],
          status: 'running',
          strictMode,
        });
        const timer = page.getByRole('timer');
        await expect(timer).toBeVisible();
        const initialRemaining = await readClockSeconds(timer);
        await expect.poll(() => readClockSeconds(timer)).toBeLessThan(initialRemaining);
      } finally {
        page.off('request', countCreateRequest);
        await prisma.user.delete({ where: { id: seed.user.id } });
      }
    }
  });

  test('c) API tạo một session liên kết đủ C1/C2/C3', async ({ page, request }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_004_multi');
    const conceptIds = seed.concepts.map((concept) => concept.id);

    try {
      // 1. Đăng nhập qua UI để lấy token thật, sau đó kiểm tra contract mảng conceptIds của API.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { planId: seed.plan.id, conceptIds, strictMode: false },
      });
      expect(response.status()).toBe(201);
      const body = (await response.json()) as ApiEnvelope<CreatedFocusSession>;
      expect(body.data).toMatchObject({
        planId: seed.plan.id,
        conceptIds,
        status: 'running',
        strictMode: false,
      });

      // 2. Dùng ID response để chứng minh chỉ một record chứa đủ ba concept đúng thứ tự input.
      const session = await prisma.focusSession.findUniqueOrThrow({
        where: { id: body.data.id },
        select: { userId: true, conceptIds: true, status: true },
      });
      expect(session).toEqual({
        userId: seed.user.id,
        conceptIds,
        status: 'running',
      });
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
