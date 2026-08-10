import { expect, test, type Page, type Route } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const queueRoutePattern = '**/api/v1/review-queue/today?*';
const loadErrorText = 'Không tải được hàng đợi ôn tập hôm nay. Vui lòng tải lại trang.';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface QueueResponse {
  items: unknown[];
  message: string | null;
  totalEstimatedMinutes: number;
}

/** Sau fallback, chọn C1 trên đồ thị thật, quay về deep-link Focus và bắt đầu session thật. */
async function chooseC1FromGraphAndStart(page: Page, seed: FocusPlanSeed): Promise<string> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

  // 1. Trên đồ thị thật, click node C1 và mở panel chi tiết.
  await expect(page).toHaveURL(new RegExp(`/plan/${seed.plan.id}$`));
  await expect(page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true })).toBeVisible();
  const c1Node = page
    .locator('[data-slot="concept-node"]')
    .filter({ hasText: conceptC1.name })
    .first();
  await expect(c1Node).toBeVisible();
  await c1Node.click();
  const detailPanel = page.getByRole('complementary').filter({ hasText: conceptC1.name });
  await expect(detailPanel).toBeVisible();

  // 2. Chọn Học lại để dùng deep-link thủ công, không phụ thuộc SRE queue.
  await detailPanel.getByRole('button', { name: 'Học lại khái niệm này', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/focus\\?planId=${seed.plan.id}&conceptId=${conceptC1.id}$`)
  );
  await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();

  // 3. Bắt đầu bằng UI; POST focus session vẫn là backend thật.
  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
  );
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(201);
  const body = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
  return body.data.id;
}

/** Assertion chung cho nhánh SRE lỗi: báo rõ, hết spinner và phải có lối sang đồ thị. */
async function assertErrorFallback(page: Page): Promise<void> {
  await expect(page.getByText(loadErrorText, { exact: true })).toBeVisible();
  await expect(page.locator('svg.animate-spin')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Chọn khái niệm trên đồ thị', exact: true })
  ).toBeVisible({ timeout: 4_000 });
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-019: Fallback khi SRE gợi ý timeout, 5xx hoặc rỗng', () => {
  test('a) Timeout báo lỗi và vẫn cho chọn concept thủ công từ đồ thị', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_019_timeout');
    let queueRequests = 0;
    const timeoutHandler = async (route: Route) => {
      expect(route.request().method()).toBe('GET');
      queueRequests += 1;
      await route.abort('timedout');
    };

    try {
      // 1. Fault-inject riêng GET SRE thành transport timeout; mọi request khác vẫn thật.
      await page.route(queueRoutePattern, timeoutHandler);
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');

      // 2. UI phải thoát loading, báo lỗi và có fallback sang đồ thị.
      await assertErrorFallback(page);
      expect(queueRequests).toBe(1);

      // 3. Khi có fallback, phần còn lại phải chọn C1 và tạo session thật, không dùng mock 2xx.
      await page.getByRole('link', { name: 'Chọn khái niệm trên đồ thị', exact: true }).click();
      const sessionId = await chooseC1FromGraphAndStart(page, seed);
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { userId: true, conceptIds: true, status: true },
        })
      ).toEqual({ userId: seed.user.id, conceptIds: [seed.concepts[0]?.id], status: 'running' });
    } finally {
      // 4. Tháo fault route và cascade cleanup session/seed.
      await page.unroute(queueRoutePattern, timeoutHandler).catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) HTTP 500 báo lỗi và vẫn cho chọn concept thủ công từ đồ thị', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_019_500');
    let queueRequests = 0;
    const serverErrorHandler = async (route: Route) => {
      expect(route.request().method()).toBe('GET');
      queueRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Injected SRE failure for TC-FS-019' },
        }),
      });
    };

    try {
      // 1. Fault-inject đúng boundary SRE thành 500; không giả response thành công.
      await page.route(queueRoutePattern, serverErrorHandler);
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');

      // 2. UI phải báo lỗi hữu ích, không spinner vô hạn và giữ lối chọn thủ công.
      await assertErrorFallback(page);
      expect(queueRequests).toBe(1);

      // 3. Fallback qua graph/deep-link vẫn phải POST session C1 vào backend/database thật.
      await page.getByRole('link', { name: 'Chọn khái niệm trên đồ thị', exact: true }).click();
      const sessionId = await chooseC1FromGraphAndStart(page, seed);
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { conceptIds: true, status: true },
        })
      ).toEqual({ conceptIds: [seed.concepts[0]?.id], status: 'running' });
    } finally {
      // 4. Tháo handler 500 và cascade cleanup.
      await page.unroute(queueRoutePattern, serverErrorHandler).catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('c) Queue 200 rỗng dùng DB thật, hiển thị thông điệp và cho bắt đầu C1 qua đồ thị', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_019_empty');

    try {
      // 1. Dời toàn bộ lịch thật sang tương lai để endpoint today trả 200/items=[] có lịch sử.
      await prisma.reviewQueueItem.updateMany({
        where: { planId: seed.plan.id },
        data: { scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1_000) },
      });
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);

      // 2. Đối chiếu response SRE thật trước: rỗng, total 0 và có message không fail-silent.
      const queueResponse = await request.get(`${API_BASE_URL}/api/v1/review-queue/today?limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(queueResponse.status()).toBe(200);
      const queueBody = (await queueResponse.json()) as ApiEnvelope<QueueResponse>;
      expect(queueBody.data).toEqual({
        items: [],
        message: 'Bạn đã hoàn thành kế hoạch hôm nay 🎉',
        totalEstimatedMinutes: 0,
      });

      // 3. Focus hiển thị empty message và lối graph thật thay vì spinner hoặc crash.
      await page.goto('/focus');
      await expect(
        page.getByRole('heading', { name: 'Bạn đã hoàn thành kế hoạch hôm nay 🎉', exact: true })
      ).toBeVisible();
      const graphFallback = page.getByRole('link', {
        name: 'Vẫn muốn ôn thêm — chọn khái niệm trên đồ thị →',
        exact: true,
      });
      await expect(graphFallback).toBeVisible();
      await expect(page.locator('svg.animate-spin')).toHaveCount(0);

      // 4. Chọn C1 qua đồ thị/deep-link và bắt đầu được một session thật.
      await graphFallback.click();
      const sessionId = await chooseC1FromGraphAndStart(page, seed);
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { userId: true, planId: true, conceptIds: true, status: true },
        })
      ).toEqual({
        userId: seed.user.id,
        planId: seed.plan.id,
        conceptIds: [seed.concepts[0]?.id],
        status: 'running',
      });
    } finally {
      // 5. Cascade cleanup session, queue, concepts và plan.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
