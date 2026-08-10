import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  seedFocusPlan,
  seedStudentWithoutPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-001: Điều kiện truy cập và state vào Focus Session', () => {
  test('a) Chưa đăng nhập: redirect về Login, API trả 401 và không tạo session', async ({
    page,
    request,
  }) => {
    let uiCreateRequests = 0;
    const countUiCreateRequest = (uiRequest: { method(): string; url(): string }) => {
      if (
        uiRequest.method() === 'POST' &&
        new URL(uiRequest.url()).pathname === '/api/v1/focus-sessions'
      ) {
        uiCreateRequests += 1;
      }
    };
    page.on('request', countUiCreateRequest);

    // 1. Mở trực tiếp route Focus khi chưa có phiên đăng nhập.
    await page.goto('/focus');
    await expect(page).toHaveURL(/\/login$/);
    expect(uiCreateRequests).toBe(0);

    // 2. Gọi API tạo phiên không có Bearer token để xác minh backend cũng chặn.
    const response = await request.post(`${API_BASE_URL}/api/v1/focus-sessions`, {
      data: {
        planId: '00000000-0000-4000-8000-000000000001',
        conceptIds: ['00000000-0000-4000-8000-000000000002'],
      },
    });
    expect(response.status()).toBe(401);
    page.off('request', countUiCreateRequest);
  });

  test('b) Đã đăng nhập nhưng không có active plan: dùng đúng state mockup và không tạo session', async ({
    page,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'tc_fs_001_no_plan');
    let createRequests = 0;
    const countCreateRequest = (request: { method(): string; url(): string }) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/focus-sessions'
      ) {
        createRequests += 1;
      }
    };
    page.on('request', countCreateRequest);

    try {
      // 1. Đăng nhập qua UI thật rồi mở Focus.
      await loginViaUi(page, student.email);
      await page.goto('/focus');

      // 2. Nhánh không có plan dùng đúng heading/CTA của mockup, không tự dựng concept picker.
      await expect(
        page.getByRole('heading', {
          name: 'Bạn chưa có kế hoạch ôn tập nào đang hoạt động.',
          exact: true,
        })
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Tạo kế hoạch đầu tiên', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toHaveCount(0);
      expect(createRequests).toBe(0);
      expect(await prisma.focusSession.count({ where: { userId: student.id } })).toBe(0);
    } finally {
      // 3. Dọn đúng Student của sub-test kể cả khi assertion thất bại.
      page.off('request', countCreateRequest);
      await prisma.user.delete({ where: { id: student.id } });
    }
  });

  test('c) Queue có item: hiển thị C1/reason, chưa tạo session trước Bắt đầu', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_001_queue');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    let createRequests = 0;
    const countCreateRequest = (request: { method(): string; url(): string }) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/focus-sessions'
      ) {
        createRequests += 1;
      }
    };
    page.on('request', countCreateRequest);

    try {
      // 1. Đăng nhập và mở Focus từ sidebar/route chung để client đọc items[0].
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');

      // 2. State chưa bắt đầu phải dùng đúng concept và lý do do review queue trả về.
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();
      await expect(
        page.getByText('Được thêm vào hàng đợi thủ công', { exact: true })
      ).toBeVisible();
      await expect(page.getByText('25:00', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Chọn khái niệm khác →', exact: true })
      ).toBeVisible();

      // 3. Trước khi bấm Bắt đầu không được có timer, nút Hủy, request tạo hay record DB.
      await expect(page.getByRole('timer')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Hủy phiên', exact: true })).toHaveCount(0);
      expect(createRequests).toBe(0);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);
    } finally {
      page.off('request', countCreateRequest);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
