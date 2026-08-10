import { expect, test, type Request, type Route } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-023: Spam click Bắt đầu không tạo phiên trùng lặp', () => {
  test('năm click liên tiếp chỉ gửi một POST và tạo đúng một session C1', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_023');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const startRequests: Request[] = [];
    const captureStartRequest = (request: Request) => {
      if (
        request.method() === 'POST' &&
        request.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      ) {
        startRequests.push(request);
      }
    };
    page.on('request', captureStartRequest);
    let notifyFirstPostHeld: () => void = () => {};
    const firstPostHeld = new Promise<void>((resolve) => {
      notifyFirstPostHeld = resolve;
    });
    let releaseFirstPost: () => void = () => {};
    const firstPostGate = new Promise<void>((resolve) => {
      releaseFirstPost = resolve;
    });
    let firstPostWasHeld = false;
    const holdOnlyFirstPost = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      if (!firstPostWasHeld) {
        firstPostWasHeld = true;
        notifyFirstPostHeld();
        await firstPostGate;
      }
      await route.continue();
    };
    const startUrl = `${API_BASE_URL}/api/v1/focus-sessions`;
    await page.route(startUrl, holdOnlyFirstPost);

    try {
      // 1. Đăng nhập, mở màn chuẩn bị C1 và chứng minh chưa có session trước burst click.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      const startButton = page.getByRole('button', { name: 'Bắt đầu', exact: true });
      await expect(startButton).toBeVisible();
      await expect(startButton).toBeEnabled();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);

      // 2. Giữ request đầu ở biên network để bốn lần kích hoạt sau thật sự xảy ra khi POST pending.
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      const startButtonBox = await startButton.boundingBox();
      if (!startButtonBox) throw new Error('Không đọc được tọa độ nút Bắt đầu.');
      const buttonX = startButtonBox.x + startButtonBox.width / 2;
      const buttonY = startButtonBox.y + startButtonBox.height / 2;
      await page.mouse.click(buttonX, buttonY);
      await firstPostHeld;

      // 3. Loading phải khóa nút đủ sớm; phát bốn mouse click độc lập, không dùng clickCount giả.
      await expect(startButton).toBeDisabled();
      await expect(startButton).toHaveAttribute('aria-busy', 'true');
      for (let attempt = 2; attempt <= 5; attempt += 1) {
        await page.mouse.click(buttonX, buttonY);
      }
      expect(startRequests).toHaveLength(1);

      // 4. Chỉ sau burst mới nhả request đầu để backend thật tạo session và trả ID authoritative.
      releaseFirstPost();
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;

      // 5. Sau khi network lắng, burst vẫn chỉ có đúng một POST với payload C1/P1.
      await page.waitForLoadState('networkidle');
      expect(startRequests).toHaveLength(1);
      expect(startRequests[0]?.postDataJSON()).toMatchObject({
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
      });

      // 6. UI chỉ chuyển một lần sang màn đang học và nút Bắt đầu biến mất.
      await expect(page.getByRole('timer')).toBeVisible();
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();
      await expect(startButton).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      const storedSnapshot = await page.evaluate(() => {
        const raw = localStorage.getItem('recall.focusSession');
        return raw ? (JSON.parse(raw) as { sessionId: string }) : null;
      });
      expect(storedSnapshot?.sessionId).toBe(startBody.data.id);

      // 7. Đọc DB bằng ID response: đúng một record running của C1, không có session trùng.
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: startBody.data.id },
          select: { userId: true, planId: true, conceptIds: true, status: true },
        })
      ).toEqual({
        userId: seed.user.id,
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
        status: 'running',
      });
      expect(
        await prisma.focusSession.count({
          where: { userId: seed.user.id, conceptIds: { equals: [conceptC1.id] } },
        })
      ).toBe(1);
    } finally {
      // 8. Luôn nhả route/listener và cascade cleanup session đang chạy từ User gốc.
      releaseFirstPost();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.unroute(startUrl, holdOnlyFirstPost);
      page.off('request', captureStartRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
