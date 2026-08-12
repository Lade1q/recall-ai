import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function expectedDeadlineText(deadline: Date, now: Date = new Date()): string {
  const days = Math.round((utcMidnight(deadline) - utcMidnight(now)) / MS_PER_DAY);
  if (days < 0) return `quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return 'hạn hôm nay';
  if (days === 1) return 'còn 1 ngày';
  return `còn ${days} ngày`;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-003: Danh sách plan active, tiến độ và deadline', () => {
  test('a) Deadline tương lai: P1 hiện tiến độ và số ngày còn lại chính xác', async ({ page }) => {
    const deadline = new Date(Date.now() + 7 * MS_PER_DAY);
    const seed = await seedDashboardData(prisma, 'tc_db_003_a', { p1Deadline: deadline });
    const [p1] = seed.plans;

    if (!p1) {
      throw new Error('Seed TC-DB-003a thiếu P1.');
    }

    try {
      // 1. Đăng nhập qua UI và mở Dashboard có P1 deadline tương lai.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Kiểm tra P1 và phân bố tiến độ ban đầu từ ba mastery score đã seed.
      const planCard = page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true });
      await expect(planCard).toContainText(/1\s*vững/);
      await expect(planCard).toContainText(/1\s*yếu/);
      await expect(planCard).toContainText(/1\s*chưa kiểm tra/);

      // 3. Đối chiếu chính xác countdown của deadline với ngày UTC hiện tại.
      const deadlinePanel = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sắp đến hạn', exact: true }),
      });
      await expect(deadlinePanel).toContainText(expectedDeadlineText(deadline));

      // 4. Đổi mastery bằng Database, reload và kiểm tra thanh tiến độ đọc lại dữ liệu mới.
      const updateResult = await prisma.concept.updateMany({
        where: { planId: p1.id, name: 'Concept C1' },
        data: { masteryScore: 0.8 },
      });
      expect(updateResult.count).toBe(1);
      await page.reload();
      await expect(planCard).toContainText(/2\s*vững/);
      await expect(planCard).toContainText(/0\s*yếu/);
    } finally {
      // 5. Xóa user gốc để cascade dọn plan, concept, queue và session.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Deadline hôm nay được nhận diện đúng, không lệch sang ngày khác', async ({ page }) => {
    const deadline = new Date();
    const seed = await seedDashboardData(prisma, 'tc_db_003_b', { p1Deadline: deadline });

    try {
      // 1. Đăng nhập vào Dashboard với P1 có deadline cùng ngày.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. Dashboard vẫn liệt kê P1 và deadline panel hiện đúng nhãn hạn hôm nay.
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();
      const deadlinePanel = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sắp đến hạn', exact: true }),
      });
      await expect(deadlinePanel).toContainText('hạn hôm nay');
      await expect(deadlinePanel).not.toContainText(/còn 1 ngày|quá hạn 1 ngày/);
    } finally {
      // 3. Dọn dữ liệu test.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('c) Plan active quá hạn vẫn được cảnh báo; plan archived/draft không thuộc catalog active', async ({
    page,
  }) => {
    const pastDeadline = new Date(Date.now() - 5 * MS_PER_DAY);
    const seed = await seedDashboardData(prisma, 'tc_db_003_c', {
      p1Deadline: pastDeadline,
      hasP2: true,
      p2Deadline: new Date(Date.now() + 5 * MS_PER_DAY),
    });

    try {
      // 1. Bổ sung hai plan không active để kiểm tra bộ lọc catalog.
      await prisma.studyPlan.createMany({
        data: [
          { userId: seed.user.id, name: 'Plan P3 Archived', status: 'archived' },
          { userId: seed.user.id, name: 'Plan P4 Draft', status: 'draft' },
        ],
      });

      // 2. Đăng nhập và xác minh chỉ plan active xuất hiện trong catalog.
      await loginViaUi(page, seed.user.email);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P2', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P3 Archived', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P4 Draft', exact: true })
      ).toHaveCount(0);

      // 3. Plan active quá hạn không bị ẩn âm thầm mà phải có cảnh báo quá hạn đúng số ngày.
      const deadlinePanel = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sắp đến hạn', exact: true }),
      });
      await expect(deadlinePanel).toContainText('Plan P1');
      await expect(deadlinePanel).toContainText(expectedDeadlineText(pastDeadline));
    } finally {
      // 4. Dọn dữ liệu test bằng cascade của user.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('d) Plan active không deadline: vẫn có catalog nhưng không tạo countdown 0 hoặc âm', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_003_d', { p1Deadline: null });

    try {
      // 1. Đăng nhập vào Dashboard có một plan active nhưng chưa đặt deadline.
      await loginViaUi(page, seed.user.email);
      await expect(page).toHaveURL(/\/dashboard$/);

      // 2. P1 vẫn là plan active, còn panel deadline thể hiện empty state đã implement.
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();
      const deadlinePanel = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sắp đến hạn', exact: true }),
      });
      await expect(deadlinePanel).toContainText('Chưa có kế hoạch nào đặt hạn ôn.');
      await expect(deadlinePanel).not.toContainText(/còn 0 ngày|quá hạn \d+ ngày/);
    } finally {
      // 3. Dọn dữ liệu test.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
