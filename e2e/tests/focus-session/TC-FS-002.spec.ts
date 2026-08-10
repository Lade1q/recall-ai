import { expect, test } from '@playwright/test';

import {
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-002: Cấu hình Pomodoro theo phiên trước và trong khi chạy', () => {
  test('a/b/c) Mặc định, cấu hình trước Start và cấu hình từ lượt kế tiếp', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_002');
    let userConfigPatches = 0;
    const countUserConfigPatch = (request: { method(): string; url(): string }) => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/v1/users/me/pomodoro-config'
      ) {
        userConfigPatches += 1;
      }
    };
    page.on('request', countUserConfigPatch);

    try {
      // 1. Đăng nhập, mở C1 và kiểm tra cấu hình Pomodoro mặc định trước khi bắt đầu.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await expect(page.getByText('25:00', { exact: true })).toBeVisible();
      await expect(page.getByText(/Bốn lượt 25 phút, nghỉ 5 phút/)).toBeVisible();
      const strictSwitch = page.getByRole('switch', {
        name: 'Chế độ nghiêm ngặt',
        exact: true,
      });
      await expect(strictSwitch).toHaveAttribute('aria-checked', 'true');

      // 2. Mở panel trước Start: phải có đủ bốn ô số, âm báo và phạm vi chỉ cho phiên này.
      await page.getByRole('button', { name: 'Đổi độ dài lượt', exact: true }).click();
      const setupDialog = page.getByRole('dialog', { name: 'Cấu hình Pomodoro', exact: true });
      await expect(setupDialog).toBeVisible();
      await expect(
        setupDialog.getByText('Chỉ đổi cho phiên này · áp dụng ngay khi bắt đầu', { exact: true })
      ).toBeVisible();
      const setupFields = setupDialog.getByRole('spinbutton');
      await expect(setupFields).toHaveCount(4);
      await expect(setupFields.nth(0)).toHaveValue('25');
      await expect(setupFields.nth(1)).toHaveValue('5');
      await expect(setupFields.nth(2)).toHaveValue('15');
      await expect(setupFields.nth(3)).toHaveValue('4');
      const setupSound = setupDialog.getByRole('switch', {
        name: 'Âm báo khi hết giờ',
        exact: true,
      });
      await expect(setupSound).toHaveAttribute('aria-checked', 'true');

      // 3. Đổi cấu hình hợp lệ cho riêng phiên: work=1 giúp test ranh giới lượt không phải chờ 25m.
      await setupFields.nth(0).fill('1');
      await setupFields.nth(1).fill('2');
      await setupFields.nth(2).fill('3');
      await setupFields.nth(3).fill('2');
      await setupDialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
      await strictSwitch.click();
      await expect(strictSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByText('01:00', { exact: true })).toBeVisible();
      await expect(page.getByText(/Hai lượt 1 phút, nghỉ 2 phút/)).toBeVisible();
      expect(userConfigPatches).toBe(0);

      // 4. Cài clock trước Start để đi qua ranh giới lượt một cách tất định, không chờ wall-clock.
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 60_000));
      const createResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/api/v1/focus-sessions'
      );
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      expect((await createResponse).status()).toBe(201);
      const timer = page.getByRole('timer');
      await expect(timer).toBeVisible();
      await page.clock.runFor(10_000);
      const currentTarget = await readClockSeconds(timer);
      expect(currentTarget).toBeLessThanOrEqual(50);

      // Gắn bộ đếm thay AudioContext: nếu sound=false không được gọi playChime ở mọi transition.
      await page.evaluate(() => {
        (window as unknown as { __tcFs002Chimes: number }).__tcFs002Chimes = 0;
        Object.defineProperty(window, 'AudioContext', {
          configurable: true,
          value: function ControlledAudioContext() {
            (window as unknown as { __tcFs002Chimes: number }).__tcFs002Chimes += 1;
            throw new Error('TC-FS-002 intercepted an unexpected chime.');
          },
        });
      });

      // 5. Giữa lượt, panel phải báo áp dụng từ lượt kế tiếp và khóa trạng thái Strict Mode.
      await page.getByRole('button', { name: 'Cấu hình Pomodoro', exact: true }).click();
      const runningDialog = page.getByRole('dialog', { name: 'Cấu hình Pomodoro', exact: true });
      await expect(
        runningDialog.getByText('Chỉ đổi cho phiên này · áp dụng từ lượt kế tiếp', { exact: true })
      ).toBeVisible();
      await expect(
        runningDialog.getByText('Chế độ nghiêm ngặt đang tắt, giữ nguyên cho tới hết phiên.', {
          exact: true,
        })
      ).toBeVisible();
      const runningFields = runningDialog.getByRole('spinbutton');
      await runningFields.nth(0).fill('2');
      await runningFields.nth(1).fill('4');
      await runningFields.nth(2).fill('6');
      await runningFields.nth(3).fill('3');
      const runningSound = runningDialog.getByRole('switch', {
        name: 'Âm báo khi hết giờ',
        exact: true,
      });
      await runningSound.click();
      await expect(runningSound).toHaveAttribute('aria-checked', 'false');
      await runningDialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();

      // 6. Lượt đang chạy không nhảy lên 2 phút; tiến độ kế hoạch có thể đổi ngay thành 3 chu kỳ.
      expect(await readClockSeconds(timer)).toBeLessThanOrEqual(currentTarget);
      await expect(page.getByText(/Pomodoro 1 \/ 3/)).toBeVisible();
      expect(userConfigPatches).toBe(0);

      // 7. Hết đúng phần còn lại của lượt cũ: short break mới phải là 4 phút.
      await page.clock.runFor(currentTarget * 1_000);
      await expect(page.getByRole('heading', { name: 'Nghỉ ngắn', exact: true })).toBeVisible();
      await expect(page.getByText('04:00', { exact: true })).toBeVisible();

      // 8. Bỏ nghỉ: lượt work kế nhận 2 phút; hết lượt 2 lại dùng short break 4 phút.
      await page.getByRole('button', { name: 'Bỏ qua giờ nghỉ', exact: true }).click();
      await expect.poll(() => readClockSeconds(timer)).toBe(120);
      await page.clock.runFor(120_000);
      await expect(page.getByRole('heading', { name: 'Nghỉ ngắn', exact: true })).toBeVisible();
      await expect(page.getByText('04:00', { exact: true })).toBeVisible();

      // 9. Lượt thứ ba dùng work=2; hoàn tất đủ cycles=3 thì long break mới phải là 6 phút.
      await page.getByRole('button', { name: 'Bỏ qua giờ nghỉ', exact: true }).click();
      await expect.poll(() => readClockSeconds(timer)).toBe(120);
      await expect(page.getByText(/Pomodoro 3 \/ 3/)).toBeVisible();
      await page.clock.runFor(120_000);
      await expect(page.getByRole('heading', { name: 'Nghỉ dài', exact: true })).toBeVisible();
      await expect(page.getByText('06:00', { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          () => (window as unknown as { __tcFs002Chimes: number }).__tcFs002Chimes
        )
      ).toBe(0);
      expect(userConfigPatches).toBe(0);
    } finally {
      page.off('request', countUserConfigPatch);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
