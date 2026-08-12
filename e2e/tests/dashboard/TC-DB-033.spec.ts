import { expect, test, type Route } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-033: Spam click CTA "Bắt đầu phiên" từ gợi ý hôm nay', () => {
  test('Năm click nhanh Bắt đầu Focus chỉ tạo một session khi request đầu còn pending', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_033', { seedActivity: false });
    let releaseFirstRequest: () => void = () => {};
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    let firstRequestSeenResolve: () => void = () => {};
    const firstRequestSeen = new Promise<void>((resolve) => {
      firstRequestSeenResolve = resolve;
    });
    let focusCreateRequestCount = 0;
    const focusCreateMatcher = (url: URL) => url.pathname === '/api/v1/focus-sessions';
    const focusCreateHandler = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      focusCreateRequestCount += 1;
      if (focusCreateRequestCount === 1) {
        firstRequestSeenResolve();
        await firstRequestGate;
      }
      await route.continue();
    };
    await page.route(focusCreateMatcher, focusCreateHandler);

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-033 thiếu P1.');

      // 1. Đăng nhập Dashboard và mở setup Focus đúng từ CTA của gợi ý hôm nay.
      await loginViaUi(page, seed.user.email);
      const focusLink = page.getByRole('link', { name: 'Bắt đầu Focus Session', exact: true });
      await Promise.all([
        page.waitForURL(new RegExp(`/focus\\?planId=${p1.id}&conceptId=`)),
        focusLink.click(),
      ]);
      const startButton = page.getByRole('button', { name: 'Bắt đầu', exact: true });
      await expect(startButton).toBeVisible();

      // 2. Gắn quan sát disabled trước burst để thấy các click sau bị chặn khi request đầu còn pending.
      await startButton.evaluate((button) => {
        const target = button as HTMLButtonElement;
        const state = window as Window & {
          tcDb33Disabled?: boolean;
          tcDb33ClickCount?: number;
        };
        state.tcDb33Disabled = target.disabled;
        state.tcDb33ClickCount = 0;
        target.addEventListener(
          'click',
          () => {
            state.tcDb33ClickCount = (state.tcDb33ClickCount ?? 0) + 1;
          },
          true
        );
        new MutationObserver(() => {
          if (target.disabled) state.tcDb33Disabled = true;
        }).observe(target, { attributes: true, attributeFilter: ['disabled'] });
      });
      const box = await startButton.boundingBox();
      if (!box) throw new Error('Không xác định được vị trí nút Bắt đầu Focus.');
      const createResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/focus-sessions' &&
          response.request().method() === 'POST' &&
          response.status() === 201
      );

      // 3. Phát năm mouse click độc lập; handler chỉ gate POST đầu, không thay response thành công.
      for (let index = 0; index < 5; index += 1) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      await firstRequestSeen;
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean((window as Window & { tcDb33Disabled?: boolean }).tcDb33Disabled)
          )
        )
        .toBe(true);
      await expect
        .poll(() =>
          page.evaluate(() => (window as Window & { tcDb33ClickCount?: number }).tcDb33ClickCount)
        )
        .toBe(1);

      // 4. Nhả gate, để đúng request gốc đi qua backend/database thật rồi chờ network lắng.
      releaseFirstRequest();
      const response = await createResponse;
      const body = (await response.json()) as { data: { id: string } };
      await page.waitForLoadState('networkidle');

      // 5. Xác nhận chỉ một POST và đúng một record Focus được tạo cho P1/C1.
      expect(focusCreateRequestCount).toBe(1);
      await expect
        .poll(() =>
          prisma.focusSession.count({
            where: { id: body.data.id, userId: seed.user.id, planId: p1.id },
          })
        )
        .toBe(1);
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id, planId: p1.id } }))
        .toBe(1);
    } finally {
      // 6. Luôn nhả gate và tháo route trước khi dọn DB để request bị chặn không chạy sau cleanup.
      releaseFirstRequest();
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await page.unroute(focusCreateMatcher, focusCreateHandler);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
