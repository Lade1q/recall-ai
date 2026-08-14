import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

interface TodayMessageEnvelope {
  success: boolean;
  data: {
    items: Array<unknown>;
    message: string | null;
  };
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-006: Empty state của gợi ý hôm nay', () => {
  test('a) Queue đã có history nhưng mọi item hôm nay hoàn tất: hiện thông điệp chúc mừng', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_006_a', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) {
        throw new Error('Seed TC-DB-006a thiếu P1.');
      }
      const concept = await prisma.concept.findFirstOrThrow({
        where: { planId: p1.id, name: 'Concept C1' },
        select: { id: true },
      });
      await prisma.reviewQueueItem.create({
        data: {
          planId: p1.id,
          conceptId: concept.id,
          reason: 'manual',
          status: 'done',
          scheduledFor: new Date(),
        },
      });

      // 1. Đăng nhập và chờ response hàng đợi thật xác nhận history có nhưng list đến hạn rỗng.
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/review-queue/today' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await loginViaUi(page, seed.user.email);
      const response = (await (await responsePromise).json()) as TodayMessageEnvelope;
      expect(response).toMatchObject({
        success: true,
        data: { items: [], message: 'Bạn đã hoàn thành kế hoạch hôm nay 🎉' },
      });

      // 2. UI hiển thị đúng message backend và không dựng danh sách gợi ý giả.
      const todaySection = page
        .getByText('Bạn đã hoàn thành kế hoạch hôm nay 🎉', { exact: true })
        .locator('xpath=ancestor::section[1]');
      await expect(todaySection).toBeVisible();
      await expect(todaySection.getByRole('listitem')).toHaveCount(0);

      // 3. Reload không sinh thêm item và vẫn giữ empty state đúng.
      const reloadResponse = page.waitForResponse(
        (candidate) =>
          new URL(candidate.url()).pathname === '/api/v1/review-queue/today' &&
          candidate.request().method() === 'GET' &&
          candidate.status() === 200
      );
      await page.reload();
      await reloadResponse;
      expect(await prisma.reviewQueueItem.count({ where: { planId: p1.id } })).toBe(1);
      await expect(
        page.getByText('Bạn đã hoàn thành kế hoạch hôm nay 🎉', { exact: true })
      ).toBeVisible();
    } finally {
      // 4. Dọn toàn bộ dữ liệu seed bằng cascade theo user.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Chưa từng vấn đáp, queue rỗng: hiện thông điệp bắt đầu phiên đầu tiên', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_006_b', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) {
        throw new Error('Seed TC-DB-006b thiếu P1.');
      }

      // 1. Đăng nhập plan có graph nhưng không có ReviewQueueItem/history.
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/review-queue/today' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await loginViaUi(page, seed.user.email);
      const response = (await (await responsePromise).json()) as TodayMessageEnvelope;
      expect(response).toMatchObject({ success: true, data: { items: [], message: null } });

      // 2. Client chuyển message null thành empty state dành cho plan chưa có kết quả vấn đáp.
      const todaySection = page
        .getByRole('heading', {
          name: 'Đồ thị đã sẵn sàng — bắt đầu phiên đầu tiên',
          exact: true,
        })
        .locator('xpath=ancestor::section[1]');
      await expect(
        todaySection.getByRole('link', { name: 'Bắt đầu phiên vấn đáp', exact: true })
      ).toHaveAttribute('href', '/interview');
      await expect(todaySection.getByRole('listitem')).toHaveCount(0);

      // 3. Reload không tạo ReviewQueueItem và giữ nguyên trạng thái chưa có kết quả vấn đáp.
      await page.reload();
      expect(await prisma.reviewQueueItem.count({ where: { planId: p1.id } })).toBe(0);
      await expect(
        page.getByRole('heading', {
          name: 'Đồ thị đã sẵn sàng — bắt đầu phiên đầu tiên',
          exact: true,
        })
      ).toBeVisible();
    } finally {
      // 4. Dọn dữ liệu test.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('c) Không có plan active: hiện thông báo không có kế hoạch thay vì chia cho 0', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_006_c', { hasP1: false });

    try {
      // 1. Đăng nhập Student không có bất cứ study plan nào.
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/review-queue/today' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await loginViaUi(page, seed.user.email);
      const response = (await (await responsePromise).json()) as TodayMessageEnvelope;
      expect(response).toMatchObject({
        success: true,
        data: {
          items: [],
          message: 'Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.',
        },
      });

      // 2. Dashboard hiện empty state theo backend, không render concept hay priority lỗi.
      await expect(
        page.getByText('Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.', {
          exact: true,
        })
      ).toBeVisible();
      const todaySection = page
        .getByText('Bạn chưa có kế hoạch ôn tập nào. Tạo một kế hoạch để bắt đầu ôn.', {
          exact: true,
        })
        .locator('xpath=ancestor::section[1]');
      await expect(todaySection.getByRole('listitem')).toHaveCount(0);
      await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
    } finally {
      // 3. Dọn dữ liệu test.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
