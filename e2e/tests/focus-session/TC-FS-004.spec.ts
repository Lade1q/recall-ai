import { expect, test, type Locator } from '@playwright/test';

import { createTestPrismaClient, loginViaUi, seedFocusPlan } from './focus-session-test-utils';

const prisma = createTestPrismaClient();

/** Đọc đồng hồ `MM:SS` thành giây để so sánh các nhịp mà không phụ thuộc text trang trí. */
async function readClockSeconds(locator: Locator): Promise<number> {
  const text = await locator.textContent();
  const match = text?.match(/(\d{2}):(\d{2})/);
  if (!match) throw new Error(`Không đọc được giá trị MM:SS từ: ${text ?? '<null>'}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-004: Bắt đầu phiên Pomodoro và timer đếm ngược', () => {
  test('1) Một thao tác Bắt đầu tạo phiên và chạy timer', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_004_start');

    try {
      // 1. Đăng nhập, mở thiết lập C1 và xác minh timer chưa chạy/chưa có record.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await expect(page.getByText('25:00', { exact: true })).toBeVisible();
      await expect(page.getByRole('timer')).toHaveCount(0);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);

      // 2. Nhấn Bắt đầu đúng một lần để tạo phiên và chuyển sang giao diện học chính.
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const timer = page.getByRole('timer');
      await expect(timer).toBeVisible();
      await expect(
        page.getByRole('group', { name: 'Hiển thị tài liệu', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ghi chú nhanh', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();

      // 3. Xác minh record được tạo đúng thời điểm bắt đầu và đang liên kết C1.
      const conceptC1 = seed.concepts[0];
      if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
      const session = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: { status: true, conceptIds: true, startedAt: true },
      });
      expect(session.status).toBe('running');
      expect(session.conceptIds).toEqual([conceptC1.id]);
      expect(session.startedAt.getTime()).toBeLessThanOrEqual(Date.now());

      // 4. Đồng hồ phải giảm ngay sau thao tác Bắt đầu duy nhất.
      const initialRemaining = await readClockSeconds(timer);
      await expect
        .poll(() => readClockSeconds(timer), { timeout: 4_000 })
        .toBeLessThan(initialRemaining);
    } finally {
      // 5. Cascade cleanup cả phiên đang chạy nếu assertion thất bại.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('2) Timer Pomodoro đếm ít nhất hai nhịp và loại trừ thời gian pause', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_004_timer');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Đăng nhập, mở C1 và dùng thao tác Bắt đầu hiện có để vào phiên chạy.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();

      // 2. Giao diện chính phải có timer, tài liệu, ghi chú và các điều khiển phiên.
      const timer = page.getByRole('timer');
      await expect(timer).toBeVisible();
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();
      await expect(
        page.getByRole('group', { name: 'Hiển thị tài liệu', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ghi chú nhanh', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Kết thúc phiên học', exact: true })
      ).toBeVisible();

      // 3. Quan sát timer giảm liên tục qua tối thiểu hai nhịp một giây.
      const initialRemaining = await readClockSeconds(timer);
      let firstTick = initialRemaining;
      await expect
        .poll(
          async () => {
            firstTick = await readClockSeconds(timer);
            return firstTick;
          },
          { timeout: 4_000 }
        )
        .toBeLessThan(initialRemaining);
      await expect.poll(() => readClockSeconds(timer), { timeout: 4_000 }).toBeLessThan(firstTick);

      // 4. Tạm dừng và xác minh cả thời gian còn lại lẫn thời gian tập trung đều đóng băng.
      const focusedTally = page.locator('p').filter({ hasText: /^Tập trung\s+\d{2}:\d{2}/ });
      await expect(focusedTally).toBeVisible();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
      const remainingAtPause = await readClockSeconds(timer);
      const focusedAtPause = await readClockSeconds(focusedTally);
      await page.waitForTimeout(2_200);
      expect(await readClockSeconds(timer)).toBe(remainingAtPause);
      expect(await readClockSeconds(focusedTally)).toBe(focusedAtPause);

      // 5. Tiếp tục, chờ thời gian tập trung tăng trở lại rồi tạm dừng để kết thúc ổn định.
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await expect
        .poll(() => readClockSeconds(focusedTally), { timeout: 4_000 })
        .toBeGreaterThan(focusedAtPause);
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      const focusedAtEnd = await readClockSeconds(focusedTally);

      // 6. Kết thúc qua UI và kiểm tra record thời gian cùng snapshot khôi phục.
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      const session = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: {
          status: true,
          conceptIds: true,
          focusedSeconds: true,
          startedAt: true,
          endedAt: true,
        },
      });
      expect(session.status).toBe('completed');
      expect(session.conceptIds).toEqual([conceptC1.id]);
      expect(session.endedAt).not.toBeNull();
      expect(session.focusedSeconds).toBeGreaterThanOrEqual(focusedAtEnd);
      expect(session.focusedSeconds).toBeLessThanOrEqual(focusedAtEnd + 1);
      const elapsedSeconds = Math.floor(
        ((session.endedAt?.getTime() ?? 0) - session.startedAt.getTime()) / 1_000
      );
      expect(elapsedSeconds - session.focusedSeconds).toBeGreaterThanOrEqual(2);
      expect(await page.evaluate(() => localStorage.getItem('recall.focusSession'))).toBeNull();
    } finally {
      // 7. Luôn dọn Student và toàn bộ dữ liệu con sau khi đối chiếu DB.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
