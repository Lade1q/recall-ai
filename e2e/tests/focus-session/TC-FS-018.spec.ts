import { expect, test, type Request } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface FocusHistoryItem {
  id: string;
  status: string;
  durationMinutes: number;
  focusedSeconds: number;
  concepts: Array<{ id: string; name: string }>;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-018: Empty state khi chưa có Focus Session hoàn thành', () => {
  test('1) API/DB xác nhận completed rỗng dù có một record cancelled làm audit', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_018_api');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Seed đúng điều kiện biên: không completed nhưng có một phiên cancelled không được tính.
      const endedAt = new Date();
      const cancelled = await prisma.focusSession.create({
        data: {
          userId: seed.user.id,
          planId: seed.plan.id,
          conceptIds: [conceptC1.id],
          status: 'cancelled',
          durationMinutes: 0,
          focusedSeconds: 30,
          startedAt: new Date(endedAt.getTime() - 60_000),
          endedAt,
        },
        select: { id: true },
      });

      // 2. Đăng nhập và gọi endpoint lịch sử thật bằng token của Student C.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const response = await request.get(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 20, offset: 0 },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as ApiEnvelope<FocusHistoryItem[]>;

      // 3. API giữ record cancelled cho audit, nhưng tập completed dùng cho lịch sử tiến độ rỗng.
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: cancelled.id,
        status: 'cancelled',
        durationMinutes: 0,
        focusedSeconds: 30,
        concepts: [{ id: conceptC1.id, name: conceptC1.name }],
      });
      expect(body.data.filter((session) => session.status === 'completed')).toEqual([]);
      expect(
        await prisma.focusSession.count({
          where: { userId: seed.user.id, status: 'completed' },
        })
      ).toBe(0);
    } finally {
      // 4. Cascade cleanup record cancelled, queue, concepts và plan.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('2) UI hiển thị empty-state rõ ràng và CTA đi tới Focus setup', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_018_ui');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
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
      // 1. Thêm cancelled audit để chứng minh zero-state dựa trên completed, không dựa mọi row.
      const endedAt = new Date();
      await prisma.focusSession.create({
        data: {
          userId: seed.user.id,
          planId: seed.plan.id,
          conceptIds: [conceptC1.id],
          status: 'cancelled',
          focusedSeconds: 12,
          durationMinutes: 0,
          startedAt: new Date(endedAt.getTime() - 30_000),
          endedAt,
        },
      });

      // 2. Đi từ sidebar tới /history và xác minh route/heading tồn tại.
      await loginViaUi(page, seed.user.email);
      await page.getByRole('link', { name: 'Lịch sử & Tiến độ', exact: true }).click();
      await expect(page).toHaveURL(/\/history$/);
      await expect(
        page.getByRole('heading', { name: 'Lịch sử & Tiến độ', exact: true })
      ).toBeVisible();

      // 3. Trang phải đọc backend trước khi kết luận empty, không render placeholder tĩnh.
      await expect
        .poll(() => historyRequests, {
          timeout: 4_000,
          message: 'Chưa implement HistoryPage tải dữ liệu để quyết định empty state',
        })
        .toBeGreaterThan(0);
      await expect(page.getByText('Sắp ra mắt.', { exact: true })).toHaveCount(0);

      // 4. Zero-state nói rõ chưa có phiên hoàn thành và có CTA đúng đặc tả.
      await expect(page.getByText(/chưa có phiên học.*hoàn thành/i)).toBeVisible();
      const firstSessionCta = page.getByRole('link', {
        name: 'Bắt đầu phiên đầu tiên',
        exact: true,
      });
      await expect(firstSessionCta).toBeVisible();
      await expect(page.getByRole('listitem')).toHaveCount(0);

      // 5. CTA dẫn vào Focus setup thật, nơi C1 và nút Bắt đầu sẵn sàng.
      await firstSessionCta.click();
      await expect(page).toHaveURL(/\/focus$/);
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
    } finally {
      // 6. Tháo listener và cascade cleanup cả khi assertion UI thiếu feature thất bại.
      page.off('request', countHistoryRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
