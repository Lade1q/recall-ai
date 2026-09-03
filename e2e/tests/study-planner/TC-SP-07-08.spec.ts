import { expect, test } from '@playwright/test';
import {
  API_BASE_URL,
  cleanupPlannerUser,
  createTestPrismaClient,
  readAccessToken,
  seedPlannerPlan,
  seedStudentWithoutPlan,
  TEST_PASSWORD,
  type TestPrismaClient,
} from './study-planner-test-utils';

const prisma: TestPrismaClient = createTestPrismaClient();

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

async function openScheduleDay(page: import('@playwright/test').Page, conceptName: string) {
  const chip = page.getByRole('button').filter({ hasText: conceptName }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(
    page.getByRole('complementary', { name: /Lịch ôn|Các khái niệm còn nợ/ })
  ).toBeVisible();
}

test.beforeAll(async () => prisma.$connect());
test.afterAll(async () => prisma.$disconnect());

test.describe('Study Planner — Schedule View và SP-08 chỉnh lịch', () => {
  test('TC-SP-07-01: lịch hiển thị item review theo ngày', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp07-01');
    try {
      // 1. Tạo mục hàng đợi đến hạn rồi mở lịch mặc định của /plans.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Schedule daily',
        status: 'active',
        reviewQueue: true,
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await expect(page.getByRole('tab', { name: 'Lịch', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(page.getByRole('button', { name: /Kế hoạch 1\/1/ })).toBeVisible();
      await openScheduleDay(page, plan.concepts[0].name);
      await expect(
        page.getByRole('complementary').getByText(plan.concepts[0].name, { exact: true })
      ).toBeVisible();
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-07-02: lọc kế hoạch và đánh dấu deadline', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp07-02');
    try {
      // 1. Tạo hai kế hoạch active để kiểm tra bộ lọc và hạn chót cùng lúc.
      const first = await seedPlannerPlan(prisma, user.id, {
        name: 'Filter first',
        status: 'active',
        reviewQueue: true,
      });
      await seedPlannerPlan(prisma, user.id, {
        name: 'Filter second',
        status: 'active',
        reviewQueue: true,
      });
      // Cùng ngày với item để DayPanel có thể nêu hạn chót ngay sau khi mở ô lịch.
      await loginAs(page, user.email);
      const token = await readAccessToken(page);
      const scheduleResponse = await page.request.get(
        `${API_BASE_URL}/api/v1/review-queue/schedule`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(scheduleResponse.status()).toBe(200);
      const todayDateKey = ((await scheduleResponse.json()) as { data: { todayDateKey: string } })
        .data.todayDateKey;
      // Server lưu deadline theo dateKey của người học; dùng chính mốc server trả để không lệch
      // ngày giữa UTC của test runner và múi giờ nghiệp vụ Asia/Ho_Chi_Minh.
      await prisma.studyPlan.update({
        where: { id: first.id },
        data: { deadline: new Date(`${todayDateKey}T23:59:59.999Z`) },
      });
      await page.goto('/plans');
      await page.getByRole('button', { name: /Kế hoạch 2\/2/ }).click();
      await expect(page.getByRole('menuitemcheckbox', { name: /Filter first/ })).toBeVisible();
      await page.getByRole('menuitemcheckbox', { name: /Filter first/ }).click();
      await expect(page.getByText(/Đang ẩn 1\/2 kế hoạch/)).toBeVisible();
      await expect(page.getByText(first.concepts[0].name, { exact: true })).toHaveCount(0);
      // Đóng portal bộ lọc trước khi dùng nút tóm tắt bên ngoài; nếu menu còn mở, lớp portal sẽ
      // chặn pointer event dù nút "Hiện tất cả" đang nhìn thấy.
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: 'Chọn tất cả', exact: true })).toHaveCount(0);
      await page.getByText('Hiện tất cả', { exact: true }).click();
      await expect(page.getByText(first.concepts[0].name, { exact: true })).toBeVisible();
      await openScheduleDay(page, first.concepts[0].name);
      await expect(page.getByText('Hạn chót', { exact: false })).toBeVisible();
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-07-03: lịch vẫn hiển thị khi GET plans lỗi', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp07-03');
    try {
      // 1. Chỉ mô phỏng lỗi tải danh sách kế hoạch; endpoint lịch vẫn phải phục vụ dữ liệu.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Schedule survives',
        status: 'active',
        reviewQueue: true,
      });
      await loginAs(page, user.email);
      await page.route('**/api/v1/plans', (route) => route.abort());
      await page.goto('/plans');
      await expect(page.locator('button:disabled').filter({ hasText: 'Kế hoạch' })).toBeVisible();
      await expect(page.getByText(plan.concepts[0].name, { exact: true })).toBeVisible();
      await expect(
        page.getByText('Chưa tải được thông tin hạn chót của kế hoạch.', { exact: true })
      ).toBeVisible();
    } finally {
      await page.unroute('**/api/v1/plans');
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-08-01: dời item spaced-repetition sang ngày hợp lệ', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp08-01');
    try {
      // 1. Dời item spaced-repetition bằng picker ngày thật của Schedule View.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Reschedule item',
        status: 'active',
        reviewQueue: true,
        traceback: false,
      });
      const item = await prisma.reviewQueueItem.findFirstOrThrow({
        where: { planId: plan.id },
        select: { id: true, scheduledFor: true, status: true },
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await openScheduleDay(page, plan.concepts[0].name);
      await page
        .getByRole('complementary')
        .getByRole('button')
        .filter({ hasText: plan.concepts[0].name })
        .first()
        .click();
      await page
        .getByRole('button', { name: `Dời "${plan.concepts[0].name}" sang ngày khác`, exact: true })
        .click();
      const picker = page.locator('[data-slot="calendar"]');
      const nextDay = new Date(Date.now() + 2 * 86_400_000).getDate().toString();
      const mutation = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/api/v1/review-queue/')
      );
      // react-day-picker giữ accessible name đầy đủ (ví dụ "Saturday, September 5th, 2026"),
      // còn chữ ngày hiển thị trong button là số ngày. Dùng data-day + text để không phụ thuộc
      // locale của trình chạy; `.last()` chọn ô ngoài tháng khi target vượt sang tháng kế tiếp.
      await picker
        .locator('button[data-day]')
        .filter({ hasText: new RegExp(`^${nextDay}$`) })
        .last()
        .click();
      expect((await mutation).status()).toBe(200);
      await expect
        .poll(
          async () => (await prisma.reviewQueueItem.findUnique({ where: { id: item.id } }))?.status
        )
        .toBe('pending');
      const updated = await prisma.reviewQueueItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(updated.scheduledFor?.getTime()).not.toBe(item.scheduledFor?.getTime());
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-08-02: traceback yếu bị khóa dời lịch ở UI và server', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp08-02');
    try {
      // 1. Traceback yếu bị khóa ở UI và được kiểm tra lại bằng PATCH request.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Locked traceback',
        status: 'active',
        reviewQueue: true,
        traceback: true,
      });
      const item = await prisma.reviewQueueItem.findFirstOrThrow({
        where: { planId: plan.id, conceptId: plan.concepts[0].id },
        select: { id: true, scheduledFor: true },
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await openScheduleDay(page, plan.concepts[0].name);
      await page
        .getByRole('complementary')
        .getByRole('button')
        .filter({ hasText: plan.concepts[0].name })
        .first()
        .click();
      await expect(
        page.getByRole('button', {
          name: `Dời "${plan.concepts[0].name}" sang ngày khác`,
          exact: true,
        })
      ).toHaveCount(0);
      await expect(page.getByText('Không dời được lịch:', { exact: false })).toBeVisible();
      const token = await readAccessToken(page);
      const response = await page.request.patch(`${API_BASE_URL}/api/v1/review-queue/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { scheduledFor: '2099-01-01' },
      });
      expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: 'TRACEBACK_REPRESENTATIVE_LOCKED' },
      });
      expect(
        (
          await prisma.reviewQueueItem.findUnique({ where: { id: item.id } })
        )?.scheduledFor?.getTime()
      ).toBe(item.scheduledFor?.getTime());
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-08-03: gỡ, hoàn tác và đưa item trở lại hàng đợi', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp08-03');
    try {
      // 1. Kiểm tra remove/undo tại chỗ, sau đó restore bền vững sau reload.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Queue actions',
        status: 'active',
        reviewQueue: true,
        traceback: false,
      });
      await loginAs(page, user.email);
      await page.goto(`/plan/${plan.id}/review-queue`);
      const remove = page.getByRole('button', {
        name: `Bỏ ${plan.concepts[0].name} khỏi lịch`,
        exact: true,
      });
      const firstRemove = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/api/v1/review-queue/')
      );
      await remove.click();
      expect((await firstRemove).status()).toBe(200);
      await expect(
        page.getByRole('status').filter({ hasText: plan.concepts[0].name })
      ).toBeVisible();
      const undo = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/api/v1/review-queue/')
      );
      await page
        .getByRole('button', {
          name: `Hoàn tác việc bỏ ${plan.concepts[0].name} khỏi lịch`,
          exact: true,
        })
        .click();
      expect((await undo).status()).toBe(200);
      await expect(
        page.getByRole('button', { name: `Bỏ ${plan.concepts[0].name} khỏi lịch`, exact: true })
      ).toBeVisible();
      const secondRemove = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/api/v1/review-queue/')
      );
      await remove.click();
      expect((await secondRemove).status()).toBe(200);
      await page.reload();
      await page.getByText(/Đã gỡ khỏi lịch \(/).click();
      const restore = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/api/v1/review-queue/')
      );
      await page
        .getByRole('button', { name: `Đưa ${plan.concepts[0].name} lại vào lịch`, exact: true })
        .click();
      expect((await restore).status()).toBe(200);
      await expect
        .poll(
          async () =>
            (
              await prisma.reviewQueueItem.findFirstOrThrow({
                where: { planId: plan.id, conceptId: plan.concepts[0].id },
              })
            ).status
        )
        .toBe('pending');
      await page.reload();
      await expect(
        page.getByRole('button', { name: `Bỏ ${plan.concepts[0].name} khỏi lịch`, exact: true })
      ).toBeVisible();
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });
});
