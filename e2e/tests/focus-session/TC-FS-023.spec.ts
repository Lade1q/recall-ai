import { expect, test, type Request } from '@playwright/test';

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

    try {
      // 1. Đăng nhập, mở màn chuẩn bị C1 và chứng minh chưa có session trước burst click.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      const startButton = page.getByRole('button', { name: 'Bắt đầu', exact: true });
      await expect(startButton).toBeVisible();
      await expect(startButton).toBeEnabled();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);

      // 2. Gắn observer trước burst để không bỏ lỡ loading rất ngắn khi backend local phản hồi nhanh.
      await startButton.evaluate((element) => {
        const button = element as HTMLButtonElement;
        document.documentElement.dataset.tcFs023LoadingObserved = 'false';
        const markLoading = () => {
          if (button.disabled && button.getAttribute('aria-busy') === 'true') {
            document.documentElement.dataset.tcFs023LoadingObserved = 'true';
          }
        };
        new MutationObserver(markLoading).observe(button, {
          attributes: true,
          attributeFilter: ['disabled', 'aria-busy'],
        });
        markLoading();
      });

      // 3. Chuẩn bị wait response trước thao tác rồi phát clickCount=5 theo đúng test plan.
      const startResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
      );
      const startButtonBox = await startButton.boundingBox();
      if (!startButtonBox) throw new Error('Không đọc được tọa độ nút Bắt đầu.');
      const burstStartedAt = Date.now();
      await page.mouse.click(
        startButtonBox.x + startButtonBox.width / 2,
        startButtonBox.y + startButtonBox.height / 2,
        { clickCount: 5 }
      );
      expect(Date.now() - burstStartedAt).toBeLessThan(300);
      const startResponse = await startResponsePromise;
      expect(startResponse.status()).toBe(201);
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;

      // 4. Loading đã thực sự disable nút; sau đó network lắng và chỉ một POST được phép tồn tại.
      expect(
        await page.evaluate(() => document.documentElement.dataset.tcFs023LoadingObserved)
      ).toBe('true');
      await page.waitForLoadState('networkidle');
      expect(startRequests).toHaveLength(1);
      expect(startRequests[0]?.postDataJSON()).toMatchObject({
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
      });

      // 5. UI chỉ chuyển một lần sang màn đang học và nút Bắt đầu biến mất.
      await expect(page.getByRole('timer')).toBeVisible();
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();
      await expect(startButton).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();

      // 6. Đọc DB bằng ID response: đúng một record running của C1, không có session trùng.
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
      // 7. Luôn tháo listener và cascade cleanup session đang chạy từ User gốc.
      page.off('request', captureStartRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
