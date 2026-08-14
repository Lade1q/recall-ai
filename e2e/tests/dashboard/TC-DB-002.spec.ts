import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-002: Hiển thị đủ các khối của Dashboard mặc định', () => {
  test('a) P1 có đủ dữ liệu: tải đầy đủ các khối tổng quan', async ({ page }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_002_a');

    try {
      // 1. Đăng nhập qua UI và mở Dashboard của Student vừa seed.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      const todaySection = page
        .getByText('Gợi ý hôm nay', { exact: true })
        .locator('xpath=ancestor::section[1]');
      const graphSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true }),
      });
      const deadlineSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sắp đến hạn', exact: true }),
      });

      // 2. Xác minh danh mục plan active và thanh tiến độ từ dữ liệu P1.
      const planCard = page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true });
      await expect(planCard).toBeVisible();
      await expect(planCard).toContainText('3 khái niệm');

      // 3. Xác minh hàng đợi hôm nay lấy đúng concept đến hạn thật từ Database.
      await expect(todaySection).toContainText('Concept C1');
      await expect(
        todaySection.getByRole('link', { name: 'Bắt đầu Focus Session' })
      ).toHaveAttribute('href', new RegExp(`/focus\\?planId=${seed.plans[0]?.id}&conceptId=`));

      // 4. Xác minh dải thống kê nhanh dùng số liệu Focus và mastery đã seed.
      const weeklyStat = page.getByText('thời gian học tuần này', { exact: true }).locator('..');
      const masteryStat = page
        .getByText('khái niệm đạt mastery_score ≥ 0.8', { exact: true })
        .locator('..');
      await expect(weeklyStat).toContainText('0h 25m');
      await expect(masteryStat).toContainText('1/3');

      // 5. Xác minh mini graph và deadline panel cùng tải được dữ liệu P1.
      await expect(
        graphSection.locator('.react-flow__node').filter({ hasText: 'Concept C1' })
      ).toBeVisible();
      await expect(graphSection.getByRole('link', { name: 'Mở đồ thị đầy đủ →' })).toHaveAttribute(
        'href',
        `/plan/${seed.plans[0]?.id}`
      );
      await expect(deadlineSection).toContainText('Plan P1');
      await expect(deadlineSection).toContainText('còn 7 ngày');
    } finally {
      // 6. Dọn toàn bộ dữ liệu theo user để không ảnh hưởng worker/testcase khác.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) P1 + P2 đều active: dữ liệu hai plan không bị lẫn lộn', async ({ page }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_002_b', { hasP2: true });
    const [p1, p2] = seed.plans;

    if (!p1 || !p2) {
      throw new Error('Seed TC-DB-002b thiếu P1 hoặc P2.');
    }

    try {
      // 1. Đăng nhập Student có hai plan active.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Đối chiếu từng thẻ plan với đúng số concept/deadline đã seed.
      const p1Card = page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true });
      const p2Card = page.getByRole('link', { name: 'Mở kế hoạch Plan P2', exact: true });
      await expect(p1Card).toContainText('3 khái niệm');
      await expect(p1Card).toContainText('hạn');
      await expect(p2Card).toContainText('1 khái niệm');
      await expect(p2Card).toContainText('hạn');

      // 3. Hàng đợi chung có item thật từ cả hai plan, không ghi đè tên concept.
      const todaySection = page
        .getByText('Gợi ý hôm nay', { exact: true })
        .locator('xpath=ancestor::section[1]');
      await expect(todaySection.getByRole('listitem')).toHaveCount(2);
      await expect(todaySection).toContainText('Concept C1');
      await expect(todaySection).toContainText('Concept P2C1');

      // 4. Đổi plan trong mini graph và xác minh canvas được thay bằng graph P2, không giữ P1.
      const graphSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true }),
      });
      await graphSection.getByLabel('Chọn kế hoạch', { exact: true }).selectOption(p2.id);
      await expect(
        graphSection.locator('.react-flow__node').filter({ hasText: 'Concept P2C1' })
      ).toBeVisible();
      await expect(
        graphSection.locator('.react-flow__node').filter({ hasText: 'Concept C1' })
      ).toHaveCount(0);
      await expect(graphSection.getByRole('link', { name: 'Mở đồ thị đầy đủ →' })).toHaveAttribute(
        'href',
        `/plan/${p2.id}`
      );
    } finally {
      // 5. Cascade từ user xóa cả P1, P2 và dữ liệu con đã seed.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('c) Khối queue rỗng: chỉ khối này hiện empty state, các khối khác vẫn hoạt động', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_002_c', { emptyQueue: true });
    const [p1] = seed.plans;

    if (!p1) {
      throw new Error('Seed TC-DB-002c thiếu P1.');
    }

    try {
      // 1. Đăng nhập vào Dashboard có plan/graph/stats nhưng không có item đến hạn.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Kiểm tra empty state chỉ dành cho gợi ý hôm nay của hàng đợi rỗng.
      const todaySection = page
        .getByRole('heading', {
          name: 'Đồ thị đã sẵn sàng — bắt đầu phiên đầu tiên',
          exact: true,
        })
        .locator('xpath=ancestor::section[1]');
      await expect(
        todaySection.getByRole('link', { name: 'Bắt đầu phiên vấn đáp', exact: true })
      ).toHaveAttribute('href', '/interview');

      // 3. Các khối độc lập vẫn render bình thường, không có lỗi trắng trang.
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();
      await expect(page.getByText('0h 25m', { exact: true })).toBeVisible();
      const graphSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true }),
      });
      await expect(
        graphSection.locator('.react-flow__node').filter({ hasText: 'Concept C1' })
      ).toBeVisible();
      const deadlineSection = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sắp đến hạn', exact: true }),
      });
      await expect(deadlineSection).toContainText('Plan P1');
      await expect(
        page.getByText(/Application Error|An unexpected error has occurred/i)
      ).toHaveCount(0);
    } finally {
      // 4. Dọn dữ liệu đã seed bất kể kết quả assertion.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
