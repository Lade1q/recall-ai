import { expect, test } from '@playwright/test';
import {
  createTestPrismaClient,
  createUniqueEmail,
  loginViaUi,
  TEST_PASSWORD,
} from '../focus-session/focus-session-test-utils';

const bcrypt =
  require('../../../src/server/node_modules/bcryptjs') as typeof import('../../../src/server/node_modules/bcryptjs');
const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-034: Phân trang Lịch sử & Tiến độ', () => {
  test('TC-DB-034: tải thêm phiên kiểm tra và phiên học, giữ các hàng đã hiển thị', async ({
    page,
  }) => {
    const email = createUniqueEmail('tc_db_034');
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: 'Student History' },
      select: { id: true, email: true },
    });

    try {
      const plan = await prisma.studyPlan.create({
        data: { userId: user.id, name: 'Lịch sử phân trang', status: 'active' },
        select: { id: true },
      });
      const concept = await prisma.concept.create({
        data: { planId: plan.id, name: 'Khái niệm lịch sử' },
        select: { id: true },
      });
      const now = Date.now();

      // 1. Tạo 21 phiên thật của mỗi loại, mới nhất được xếp trước theo thời điểm bắt đầu.
      await prisma.interviewSession.createMany({
        data: Array.from({ length: 21 }, (_, index) => ({
          userId: user.id,
          planId: plan.id,
          status: 'completed' as const,
          conceptQueue: [concept.id],
          startedAt: new Date(now - index * 60_000),
          endedAt: new Date(now - index * 60_000 + 30_000),
        })),
      });
      await prisma.focusSession.createMany({
        data: Array.from({ length: 21 }, (_, index) => ({
          userId: user.id,
          planId: plan.id,
          conceptIds: [concept.id],
          status: 'completed' as const,
          durationMinutes: 25,
          focusedSeconds: 1_500,
          pomodorosCompleted: 1,
          startedAt: new Date(now - index * 60_000),
          endedAt: new Date(now - index * 60_000 + 30_000),
        })),
      });

      // 2. Đăng nhập bằng UI và mở màn Lịch sử & Tiến độ.
      await loginViaUi(page, user.email);
      await page.goto('/history');
      const interviewList = page.getByRole('region', { name: 'Danh sách phiên kiểm tra' });
      await expect(interviewList).toBeVisible();
      await expect(
        interviewList.getByRole('button', { name: 'Xem thêm phiên cũ hơn', exact: true })
      ).toBeVisible();

      // 3. Nạp trang thứ hai của tab kiểm tra; 20 hàng cũ vẫn còn và hàng thứ 21 xuất hiện.
      await interviewList
        .getByRole('button', { name: 'Xem thêm phiên cũ hơn', exact: true })
        .click();
      await expect(
        interviewList.getByRole('button', { name: 'Xem thêm phiên cũ hơn', exact: true })
      ).toHaveCount(0);
      await expect(
        interviewList.getByRole('button').filter({ hasText: 'Lịch sử phân trang' })
      ).toHaveCount(21);

      // 4. Đổi sang Phiên học; tab forceMount tải độc lập và cũng giữ 21 hàng sau Xem thêm.
      await page.getByRole('tab', { name: 'Phiên học', exact: true }).click();
      const focusList = page.getByRole('region', { name: 'Danh sách phiên học' });
      await expect(focusList).toBeVisible();
      await focusList.getByRole('button', { name: 'Xem thêm phiên cũ hơn', exact: true }).click();
      await expect(
        focusList.getByRole('button', { name: 'Xem thêm phiên cũ hơn', exact: true })
      ).toHaveCount(0);
      await expect(focusList.locator('article, li')).toHaveCount(21);

      // 5. Quay lại tab kiểm tra để xác nhận trang đã tải không bị reset về 20 hàng.
      await page.getByRole('tab', { name: 'Phiên kiểm tra', exact: true }).click();
      await expect(
        interviewList.getByRole('button').filter({ hasText: 'Lịch sử phân trang' })
      ).toHaveCount(21);
    } finally {
      // 6. Xoá user gốc; các plan, concept và phiên con được cascade xoá theo.
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
