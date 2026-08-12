import { expect, test, type Request } from '@playwright/test';

import { createTestPrismaClient, loginViaUi, seedFocusPlan } from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const completedTodayMessage = 'Bạn đã hoàn thành kế hoạch hôm nay 🎉';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ReviewSuggestion {
  conceptId: string;
  name: string;
  planId: string;
  reason: string;
  reasonText: string;
}

interface ReviewQueueResponse {
  items: ReviewSuggestion[];
  message: string | null;
  totalEstimatedMinutes: number;
}

function isReviewQueueMutation(request: Request): boolean {
  return (
    new URL(request.url()).pathname.startsWith('/api/v1/review-queue') && request.method() !== 'GET'
  );
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-011: Focus dùng trực tiếp gợi ý từ review queue', () => {
  test('a) hiển thị items[0]/reason và rời setup về Dashboard mà không tạo session', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_011_first_item');
    const [conceptC1, conceptC2, conceptC3] = seed.concepts;
    if (!conceptC1 || !conceptC2 || !conceptC3) {
      throw new Error('Seed data is missing C1, C2 or C3.');
    }
    const queueMutations: Request[] = [];
    const captureQueueMutation = (request: Request): void => {
      if (isReviewQueueMutation(request)) queueMutations.push(request);
    };
    page.on('request', captureQueueMutation);

    try {
      // 1. Seed đã có thứ tự queue xác định; Focus chỉ xin top-1 và dùng response làm chuẩn.
      await loginViaUi(page, seed.user.email);
      const queueResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/api/v1/review-queue/today' &&
          url.searchParams.get('limit') === '1'
        );
      });
      await page.getByRole('link', { name: 'Focus Session', exact: true }).click();
      const queueResponse = await queueResponsePromise;
      expect(queueResponse.status()).toBe(200);
      const queueBody = (await queueResponse.json()) as ApiEnvelope<ReviewQueueResponse>;
      expect(queueBody.success).toBe(true);
      expect(queueBody.data.items).toHaveLength(1);
      const firstItem = queueBody.data.items[0];
      if (!firstItem) throw new Error('Server did not return items[0].');
      expect(firstItem).toMatchObject({
        conceptId: conceptC1.id,
        name: conceptC1.name,
        planId: seed.plan.id,
        reason: 'manual',
        reasonText: 'Được thêm vào hàng đợi thủ công',
      });

      // 2. UI dùng nguyên item/reason server trả, không dựng picker hoặc danh sách riêng ở Focus.
      await expect(page.getByRole('heading', { name: firstItem.name, exact: true })).toBeVisible();
      await expect(page.getByText(firstItem.reasonText, { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: conceptC2.name, exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: conceptC3.name, exact: true })).toHaveCount(0);
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);

      // 3. Lối “Chọn khái niệm khác” rời setup về Dashboard trước khi session tồn tại.
      const chooseAnother = page.getByRole('link', {
        name: 'Chọn khái niệm khác →',
        exact: true,
      });
      await expect(chooseAnother).toHaveAttribute('href', '/dashboard');
      await chooseAnother.click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 4. Focus chỉ đọc queue: không PATCH queue và không tạo session trước khi Student Start.
      expect(queueMutations).toHaveLength(0);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);
    } finally {
      page.off('request', captureQueueMutation);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) items rỗng dùng đúng message server, hai CTA và không tạo session', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_011_empty');
    const queueMutations: Request[] = [];
    const captureQueueMutation = (request: Request): void => {
      if (isReviewQueueMutation(request)) queueMutations.push(request);
    };
    page.on('request', captureQueueMutation);

    try {
      // 1. Giữ lịch sử queue thật nhưng dời mọi mục sang tương lai để `/today` trả empty hợp lệ.
      await prisma.reviewQueueItem.updateMany({
        where: { planId: seed.plan.id },
        data: { scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1_000) },
      });
      await loginViaUi(page, seed.user.email);
      const queueResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/api/v1/review-queue/today' &&
          url.searchParams.get('limit') === '1'
        );
      });
      await page.getByRole('link', { name: 'Focus Session', exact: true }).click();
      const queueResponse = await queueResponsePromise;
      expect(queueResponse.status()).toBe(200);
      const queueBody = (await queueResponse.json()) as ApiEnvelope<ReviewQueueResponse>;
      expect(queueBody).toEqual({
        success: true,
        data: {
          items: [],
          message: completedTodayMessage,
          totalEstimatedMinutes: 0,
        },
      });

      // 2. Focus không viết lại câu server và không dựng picker/start state khi queue rỗng.
      await expect(
        page.getByRole('heading', { name: completedTodayMessage, exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toHaveCount(0);
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);

      // 3. Primary CTA về Dashboard; secondary CTA trỏ đúng nơi duyệt toàn bộ concept.
      const dashboardCta = page.getByRole('link', { name: 'Về Dashboard', exact: true });
      const graphCta = page.getByRole('link', {
        name: 'Vẫn muốn ôn thêm — chọn khái niệm trên đồ thị →',
        exact: true,
      });
      await expect(dashboardCta).toHaveAttribute('href', '/dashboard');
      await expect(graphCta).toHaveAttribute('href', '/graph');
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);
      await dashboardCta.click();
      await expect(page).toHaveURL(/\/dashboard$/);

      // 4. Empty-state vẫn là read-only: không session và không PATCH queue.
      expect(queueMutations).toHaveLength(0);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);
    } finally {
      page.off('request', captureQueueMutation);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
