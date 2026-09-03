import { expect, test } from '@playwright/test';
import {
  createTestPrismaClient,
  seedStudentWithoutPlan,
  TEST_PASSWORD,
  loginViaUi,
} from '../focus-session/focus-session-test-utils';

test.describe('TC-AM-03/04 — Hồ sơ và đăng xuất', () => {
  const prisma = createTestPrismaClient();

  test.beforeAll(async () => {
    await prisma.$connect();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('TC-AM-03-01: chỉ hiện thông tin của người học đang đăng nhập', async ({ page }) => {
    const student = await seedStudentWithoutPlan(prisma, 'am-profile-view', 'Ngọc An');
    try {
      // 1. Đăng nhập bằng giao diện thật rồi mở Hồ sơ.
      await loginViaUi(page, student.email);
      await page.getByRole('link', { name: 'Hồ sơ', exact: true }).click();

      // 2. Kiểm tra tên, email khóa và ngày tham gia trước/sau khi tải lại.
      await expect(page.getByRole('heading', { name: 'Hồ sơ', exact: true })).toBeVisible();
      await expect(page.getByLabel(/Tên hiển thị/)).toHaveValue('Ngọc An');
      await expect(page.getByText(student.email, { exact: true })).toBeVisible();
      await expect(page.locator('[data-slot="locked-value"]')).toContainText(student.email);
      await expect(page.getByText('Tham gia', { exact: true })).toBeVisible();
      await expect(page.getByLabel(/Tên hiển thị/)).toBeEditable();
      await page.reload();
      await expect(page.getByText(student.email, { exact: true })).toBeVisible();

      // Tài khoản không có tên vẫn phải hiển thị ô trống và lời nhắc đúng sản phẩm.
      await prisma.user.update({ where: { id: student.id }, data: { name: null } });
      await page.reload();
      await expect(page.getByLabel(/Tên hiển thị/)).toHaveValue('');
      await expect(page.getByText('Bỏ trống cũng được', { exact: false })).toBeVisible();
    } finally {
      await prisma.user.delete({ where: { id: student.id } });
    }
  });

  test('TC-AM-03-02: lưu tên, chuẩn hóa khoảng trắng và cho phép xóa', async ({ page }) => {
    const student = await seedStudentWithoutPlan(prisma, 'am-profile-name', 'Tên cũ');
    try {
      // 1. Đăng nhập, sửa tên có khoảng trắng và chờ mutation hoàn tất.
      await loginViaUi(page, student.email);
      await page.goto('/profile');
      const nameInput = page.getByLabel(/Tên hiển thị/);
      await nameInput.fill('  Ngọc An  ');
      const saveResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().endsWith('/users/me')
      );
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
      await expect((await saveResponse).status()).toBe(200);

      // 2. Tải lại rồi xác nhận Dashboard dùng tên đã lưu.
      await page.reload();
      await expect(nameInput).toHaveValue('Ngọc An');
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: /Ngọc An/ })).toBeVisible();

      // 3. Xóa tên và xác minh lời chào không thay bằng email.
      await page.goto('/profile');
      await nameInput.fill('');
      const clearResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().endsWith('/users/me')
      );
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
      await expect((await clearResponse).status()).toBe(200);
      await page.goto('/dashboard');
      await expect(
        page.getByRole('heading', { name: new RegExp(student.email), exact: false })
      ).toHaveCount(0);
    } finally {
      await prisma.user.delete({ where: { id: student.id } });
    }
  });

  test('TC-AM-03-03: đổi mật khẩu hợp lệ, sai mật khẩu cũ và xác nhận không khớp', async ({
    page,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'am-profile-password');
    const newPassword = 'NewSecurePassword456';
    try {
      // 1. Đăng nhập và kiểm tra validation client chặn xác nhận không khớp.
      await loginViaUi(page, student.email);
      await page.goto('/profile');
      await page.getByRole('tab', { name: 'Đổi mật khẩu', exact: true }).click();
      await page.getByLabel(/Mật khẩu hiện tại/).fill(TEST_PASSWORD);
      await page.getByLabel(/Mật khẩu mới/).fill('short');
      await page.getByLabel(/Nhập lại mật khẩu mới/).fill('short');
      await expect(page.getByText('Còn thiếu 3 ký tự.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Đổi mật khẩu', exact: true })).toBeDisabled();

      await page.getByLabel(/Mật khẩu mới/).fill(newPassword);
      await page.getByLabel(/Nhập lại mật khẩu mới/).fill('KhongKhop456');
      await expect(page.getByText('Mật khẩu không khớp.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Đổi mật khẩu', exact: true })).toBeDisabled();

      // 2. Mật khẩu cũ sai bị từ chối và không đổi tài khoản.
      await page.getByLabel(/Mật khẩu hiện tại/).fill('SaiMatKhau456');
      await page.getByLabel(/Nhập lại mật khẩu mới/).fill(newPassword);
      const rejected = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().endsWith('/users/me/password')
      );
      await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
      await expect((await rejected).status()).toBe(400);
      await expect(
        page.getByText('Mật khẩu hiện tại không đúng. Mật khẩu của bạn chưa bị thay đổi.')
      ).toBeVisible();

      // 3. Đổi đúng và xác nhận bằng một phiên đăng nhập mới.
      await page.getByLabel(/Mật khẩu hiện tại/).fill(TEST_PASSWORD);
      const changed = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().endsWith('/users/me/password')
      );
      await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
      await expect((await changed).status()).toBe(200);
      await expect(page.getByText('Đổi mật khẩu thành công.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.getByLabel('Email', { exact: true }).fill(student.email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(newPassword);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    } finally {
      await prisma.user.delete({ where: { id: student.id } });
    }
  });

  test('TC-AM-04-01: đăng xuất xóa phiên và về trang Đăng nhập', async ({ page }) => {
    const student = await seedStudentWithoutPlan(prisma, 'am-logout');
    try {
      // 1. Đăng nhập và đi tới điểm đăng xuất theo luồng UI.
      await loginViaUi(page, student.email);
      await page.goto('/profile');
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();

      // 2. Kiểm tra điều hướng và token cục bộ đã bị xóa.
      await expect(page).toHaveURL(/\/login/);
      expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
      await page.reload();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await prisma.user.delete({ where: { id: student.id } });
    }
  });

  test('TC-AM-04-02: route bảo vệ không mở lại sau đăng xuất', async ({ page }) => {
    const student = await seedStudentWithoutPlan(prisma, 'am-logout-protected');
    try {
      // 1. Kết thúc phiên từ Hồ sơ.
      await loginViaUi(page, student.email);
      await page.goto('/profile');
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();

      // 2. Thử từng route bảo vệ và thao tác quay lại.
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);
      await page.goto('/profile');
      await expect(page).toHaveURL(/\/login/);
      await page.goBack();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await prisma.user.delete({ where: { id: student.id } });
    }
  });

  test('TC-AM-04-03: đăng nhập người học khác sau đăng xuất không giữ cache cũ', async ({
    page,
  }) => {
    const firstStudent = await seedStudentWithoutPlan(prisma, 'am-switch-a', 'Người học A');
    const secondStudent = await seedStudentWithoutPlan(prisma, 'am-switch-b', 'Người học B');
    try {
      // 1. Đăng nhập người học thứ nhất, sau đó đăng xuất qua giao diện.
      await loginViaUi(page, firstStudent.email);
      await page.goto('/profile');
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();

      // 2. Đăng nhập người học thứ hai và kiểm tra Hồ sơ không còn dữ liệu cũ.
      await loginViaUi(page, secondStudent.email);
      await page.goto('/profile');
      await expect(page.getByText(secondStudent.email, { exact: true })).toBeVisible();
      await expect(page.getByText(firstStudent.email, { exact: true })).toHaveCount(0);
      await expect(page.getByLabel(/Tên hiển thị/)).toHaveValue('Người học B');
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [firstStudent.id, secondStudent.id] } } });
    }
  });
});
