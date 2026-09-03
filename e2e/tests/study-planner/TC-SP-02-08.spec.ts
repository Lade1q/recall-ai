import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
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

async function authRequest(
  page: import('@playwright/test').Page,
  method: string,
  url: string,
  body?: Record<string, unknown>
) {
  const token = await readAccessToken(page);
  return page.request.fetch(`${API_BASE_URL}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

test.beforeAll(async () => prisma.$connect());
test.afterAll(async () => prisma.$disconnect());

test.describe('Study Planner — SP-02, SP-03 và vòng đời plan', () => {
  test('TC-SP-02-01: xem graph active và xác nhận graph draft', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp02-01');
    try {
      // 1. Seed một graph đã xong và một bản nháp chờ xác nhận.
      const active = await seedPlannerPlan(prisma, user.id, {
        name: 'SP02 active',
        status: 'active',
        jobStatus: 'done',
        masteryScores: [0.8, 0.5, null],
      });
      const draft = await seedPlannerPlan(prisma, user.id, {
        name: 'SP02 draft',
        status: 'draft',
        jobStatus: 'done',
      });
      await loginAs(page, user.email);
      const activeResponse = await authRequest(page, 'GET', `/api/v1/plans/${active.id}`);
      expect(activeResponse.status()).toBe(200);
      const activeData = (await activeResponse.json()).data;
      expect(activeData.status).toBe('active');
      expect(activeData.concepts).toHaveLength(3);
      expect(activeData.edges).toHaveLength(2);
      // 2. Mở graph active, sau đó đi qua guard /verify của bản nháp.
      await page.goto(`/plan/${active.id}`);
      await expect(
        page.getByRole('heading', { name: 'Đồ thị khái niệm', exact: true })
      ).toBeVisible();
      await expect(page.getByText(active.concepts[0].name, { exact: true })).toBeVisible();
      await page.getByText(active.concepts[0].name, { exact: true }).click();
      await expect(
        page.getByRole('heading', { name: active.concepts[0].name, exact: true })
      ).toBeVisible();
      await expect(page.getByText('Lịch sử học tập', { exact: true })).toBeVisible();
      await page.goto(`/plan/${draft.id}`);
      await expect(page).toHaveURL(new RegExp(`/plan/${draft.id}/verify`));
      await expect(
        page.getByRole('heading', { name: 'Kiểm chứng đồ thị khái niệm', exact: true })
      ).toBeVisible();
      const confirm = page.getByRole('button', { name: 'Xác nhận & tạo lịch ôn tập', exact: true });
      await expect(confirm).toBeVisible();
      const response = page.waitForResponse(
        (r) => r.url().endsWith(`/plans/${draft.id}/graph`) && r.request().method() === 'PUT'
      );
      await confirm.click();
      // 3. Xác nhận response và trạng thái authoritative trong DB.
      await expect((await response).status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`/plan/${draft.id}$`));
      await expect
        .poll(async () => (await prisma.studyPlan.findUnique({ where: { id: draft.id } }))?.status)
        .toBe('active');
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-02-02: user khác không đọc được plan', async ({ page }) => {
    const owner = await seedStudentWithoutPlan(prisma, 'sp02-owner');
    const other = await seedStudentWithoutPlan(prisma, 'sp02-other');
    try {
      // 1. Người học khác dùng token thật để truy cập kế hoạch thuộc người học chính.
      const plan = await seedPlannerPlan(prisma, owner.id, {
        name: 'Private plan',
        status: 'active',
      });
      await loginAs(page, owner.email);
      const ownResponse = await authRequest(page, 'GET', `/api/v1/plans/${plan.id}`);
      expect(ownResponse.status()).toBe(200);
      await loginAs(page, other.email);
      const response = await authRequest(page, 'GET', `/api/v1/plans/${plan.id}`);
      expect(response.status()).toBe(403);
      expect((await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.userId).toBe(
        owner.id
      );
    } finally {
      await cleanupPlannerUser(prisma, owner.id);
      await cleanupPlannerUser(prisma, other.id);
    }
  });

  test('TC-SP-02-03: trang chi tiết hiển thị loading khi job đang chạy', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp02-03');
    try {
      // 1. Job processing phải render progress panel, không render graph rỗng.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'SP02 loading',
        status: 'draft',
        jobStatus: 'processing',
        withDocument: true,
      });
      await loginAs(page, user.email);
      await page.goto(`/plan/${plan.id}`);
      await expect(page.getByText(/Đang phân tích/)).toBeVisible();
      await expect(page.getByText('Bạn có thể rời trang.')).toBeVisible();
      // 2. Đánh dấu job thật đã xong và xác nhận polling tự chuyển sang màn kiểm chứng.
      await prisma.analysisJob.updateMany({
        where: { planDraftId: plan.id },
        data: { status: 'done', completedAt: new Date() },
      });
      await expect(page).toHaveURL(new RegExp(`/plan/${plan.id}/verify`), { timeout: 8_000 });
      await expect(
        page.getByRole('heading', { name: 'Kiểm chứng đồ thị khái niệm', exact: true })
      ).toBeVisible();
      await expect(page.getByText(plan.concepts[0].name, { exact: true })).toBeVisible();
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-03-01: danh sách phân tab active, draft và archived', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp03-01');
    try {
      // 1. Tạo ba plan thuộc ba trạng thái server.
      await seedPlannerPlan(prisma, user.id, { name: 'Active list', status: 'active' });
      await seedPlannerPlan(prisma, user.id, {
        name: 'Draft list',
        status: 'draft',
        jobStatus: 'done',
      });
      await seedPlannerPlan(prisma, user.id, { name: 'Archived list', status: 'archived' });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await page.getByRole('tab', { name: 'Kế hoạch', exact: true }).click();
      await expect(page.getByText('Active list', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: /Chưa xác nhận/ }).click();
      await expect(page.getByText('Draft list', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: /Đã lưu trữ/ }).click();
      await expect(page.getByText('Archived list', { exact: true })).toBeVisible();
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-03-03: polling danh sách đổi card khi job hoàn tất', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp03-03');
    try {
      // 1. Mở danh sách khi job processing, rồi cập nhật job thật trong DB.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Polling list',
        status: 'draft',
        jobStatus: 'processing',
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await page.getByRole('tab', { name: 'Kế hoạch', exact: true }).click();
      await page.getByRole('tab', { name: /Chưa xác nhận/ }).click();
      await expect(page.getByText('Đang phân tích', { exact: true })).toBeVisible();
      await prisma.analysisJob.updateMany({
        where: { planDraftId: plan.id },
        data: { status: 'done', completedAt: new Date() },
      });
      await expect(page.getByText('Chờ xác nhận', { exact: true })).toBeVisible({ timeout: 8_000 });
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-04-01: archive active plan bằng menu UI', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp04-01');
    try {
      // 1. Chọn hành động Lưu trữ từ menu của card và đợi PATCH hoàn tất.
      const plan = await seedPlannerPlan(prisma, user.id, { name: 'Archive me', status: 'active' });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await page.getByRole('tab', { name: 'Kế hoạch', exact: true }).click();
      await page.getByRole('button', { name: `Tuỳ chọn cho ${plan.name}`, exact: true }).click();
      const response = page.waitForResponse(
        (r) => r.url().endsWith(`/plans/${plan.id}`) && r.request().method() === 'PATCH'
      );
      await page.getByRole('menuitem', { name: 'Lưu trữ kế hoạch', exact: true }).click();
      await expect((await response).status()).toBe(200);
      await expect
        .poll(async () => (await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.status)
        .toBe('archived');
      const archived = await authRequest(page, 'GET', `/api/v1/plans/${plan.id}`);
      expect(archived.status()).toBe(200);
      expect((await archived.json()).data.status).toBe('archived');

      const draft = await seedPlannerPlan(prisma, user.id, {
        name: 'Draft cannot archive',
        status: 'draft',
      });
      const rejected = await authRequest(page, 'PATCH', `/api/v1/plans/${draft.id}`, {
        status: 'archived',
      });
      expect(rejected.status()).toBe(409);
      expect((await prisma.studyPlan.findUnique({ where: { id: draft.id } }))?.status).toBe(
        'draft'
      );
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-04-02: restore archived và delete plan cascade', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp04-02');
    try {
      // 1. Khôi phục archived, sau đó xác nhận xóa vĩnh viễn plan thứ hai.
      const archived = await seedPlannerPlan(prisma, user.id, {
        name: 'Restore me',
        status: 'archived',
      });
      const deleted = await seedPlannerPlan(prisma, user.id, {
        name: 'Delete me',
        status: 'active',
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await page.getByRole('tab', { name: 'Kế hoạch', exact: true }).click();
      await page.getByRole('tab', { name: /Đã lưu trữ/ }).click();
      await page
        .getByRole('button', { name: `Tuỳ chọn cho ${archived.name}`, exact: true })
        .click();
      const restoreResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().endsWith(`/plans/${archived.id}`)
      );
      await page.getByRole('menuitem', { name: 'Bỏ lưu trữ', exact: true }).click();
      expect((await restoreResponse).status()).toBe(200);
      await expect
        .poll(
          async () => (await prisma.studyPlan.findUnique({ where: { id: archived.id } }))?.status
        )
        .toBe('active');
      await page.getByRole('tab', { name: /Đang hoạt động/ }).click();
      await page.getByRole('button', { name: `Tuỳ chọn cho ${deleted.name}`, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Xóa vĩnh viễn', exact: true }).click();
      const deleteResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response.url().endsWith(`/plans/${deleted.id}`)
      );
      await page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
      expect((await deleteResponse).status()).toBe(204);
      await expect
        .poll(async () => prisma.studyPlan.findUnique({ where: { id: deleted.id } }))
        .toBeNull();
      expect((await authRequest(page, 'GET', `/api/v1/plans/${deleted.id}`)).status()).toBe(404);
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-04-03: user khác không archive hoặc delete plan', async ({ page }) => {
    const owner = await seedStudentWithoutPlan(prisma, 'sp04-owner');
    const other = await seedStudentWithoutPlan(prisma, 'sp04-other');
    try {
      // 1. Gửi cả PATCH và DELETE bằng token của người học không sở hữu kế hoạch.
      const plan = await seedPlannerPlan(prisma, owner.id, {
        name: 'Protected lifecycle',
        status: 'active',
      });
      await loginAs(page, owner.email);
      const ownResponse = await authRequest(page, 'GET', `/api/v1/plans/${plan.id}`);
      expect(ownResponse.status()).toBe(200);
      await loginAs(page, other.email);
      expect(
        await (
          await authRequest(page, 'PATCH', `/api/v1/plans/${plan.id}`, { status: 'archived' })
        ).status()
      ).toBe(403);
      expect(await (await authRequest(page, 'DELETE', `/api/v1/plans/${plan.id}`)).status()).toBe(
        403
      );
      expect((await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.status).toBe(
        'active'
      );
    } finally {
      await cleanupPlannerUser(prisma, owner.id);
      await cleanupPlannerUser(prisma, other.id);
    }
  });

  test('TC-SP-05-01: retry job failed tạo một job mới', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp05-01');
    try {
      // 1. Retry bằng request context; kiểm tra server tạo đúng một AnalysisJob mới.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Retry me',
        status: 'draft',
        jobStatus: 'failed',
        withDocument: true,
      });
      await loginAs(page, user.email);
      const before = await prisma.analysisJob.count({ where: { planDraftId: plan.id } });
      const response = await authRequest(page, 'POST', `/api/v1/plans/${plan.id}/retry`);
      expect(response.status()).toBe(202);
      await expect
        .poll(() => prisma.analysisJob.count({ where: { planDraftId: plan.id } }))
        .toBe(before + 1);
      expect((await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.status).toBe('draft');
      const active = await seedPlannerPlan(prisma, user.id, {
        name: 'Retry forbidden',
        status: 'active',
      });
      expect((await authRequest(page, 'POST', `/api/v1/plans/${active.id}/retry`)).status()).toBe(
        409
      );
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-05-02: đổi tài liệu tạo document và job mới', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp05-02');
    try {
      // 1. Upload fixture PDF qua multipart endpoint đổi tài liệu thật.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Change document',
        status: 'draft',
        jobStatus: 'failed',
        withDocument: true,
      });
      await loginAs(page, user.email);
      const filePath = path.join(__dirname, '../../../docs/test/fixtures/search_algorithms.pdf');
      const buffer = await fs.promises.readFile(filePath);
      const token = await readAccessToken(page);
      const response = await page.request.post(`${API_BASE_URL}/api/v1/plans/${plan.id}/document`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: { file: { name: 'replacement.pdf', mimeType: 'application/pdf', buffer } },
      });
      expect(response.status()).toBe(202);
      await expect.poll(() => prisma.document.count({ where: { planId: plan.id } })).toBe(1);
      expect((await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.status).toBe('draft');

      // 2. PDF mã hóa phải bị chặn trước khi thay document hoặc tạo job mới.
      const protectedPlan = await seedPlannerPlan(prisma, user.id, {
        name: 'Protected document',
        status: 'draft',
        jobStatus: 'failed',
        withDocument: true,
      });
      const oldDocument = await prisma.document.findFirstOrThrow({
        where: { planId: protectedPlan.id },
        select: { id: true, fileKey: true },
      });
      const jobsBefore = await prisma.analysisJob.count({
        where: { planDraftId: protectedPlan.id },
      });
      const encryptedPath = path.join(
        __dirname,
        '../../../postman/test-data/TC-SP-Studyplanner/protected.pdf'
      );
      const encrypted = await fs.promises.readFile(encryptedPath);
      const rejected = await page.request.post(
        `${API_BASE_URL}/api/v1/plans/${protectedPlan.id}/document`,
        {
          headers: { Authorization: `Bearer ${token}` },
          multipart: {
            file: { name: 'protected.pdf', mimeType: 'application/pdf', buffer: encrypted },
          },
        }
      );
      expect(rejected.status()).toBe(400);
      expect(await rejected.json()).toMatchObject({ error: { code: 'ENCRYPTED_PDF' } });
      expect(
        await prisma.document.findFirst({
          where: { planId: protectedPlan.id },
          select: { id: true, fileKey: true },
        })
      ).toEqual(oldDocument);
      expect(await prisma.analysisJob.count({ where: { planDraftId: protectedPlan.id } })).toBe(
        jobsBefore
      );
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-05-03: reanalyze active giữ mastery và hạ plan về draft', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp05-03');
    try {
      // 1. Lưu snapshot mastery trước khi gọi reanalyze.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Reanalyze me',
        status: 'active',
        masteryScores: [0.2, 0.6, 0.9],
        withDocument: true,
      });
      const oldScores = await prisma.concept.findMany({
        where: { planId: plan.id },
        orderBy: { name: 'asc' },
        select: { id: true, masteryScore: true },
      });
      await loginAs(page, user.email);
      const response = await authRequest(page, 'POST', `/api/v1/plans/${plan.id}/reanalyze`);
      expect(response.status()).toBe(202);
      expect((await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.status).toBe('draft');
      const scores = await prisma.concept.findMany({
        where: { id: { in: oldScores.map((row) => row.id) } },
        select: { id: true, masteryScore: true },
      });
      expect(new Map(scores.map((row) => [row.id, row.masteryScore]))).toEqual(
        new Map(oldScores.map((row) => [row.id, row.masteryScore]))
      );
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-06-01: card hiển thị tiến độ pending/processing', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp06-01');
    try {
      // 1. Card draft đang chạy phải hiển thị tiến độ và tên plan.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Progress card',
        status: 'draft',
        jobStatus: 'processing',
        withDocument: true,
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await page.getByRole('tab', { name: 'Kế hoạch', exact: true }).click();
      await page.getByRole('tab', { name: /Chưa xác nhận/ }).click();
      await expect(page.getByText('Đang phân tích', { exact: true })).toBeVisible();
      await expect(page.getByText(plan.name, { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Xem tiến trình', exact: true }).click();
      await expect(page.getByText(/Đang phân tích/)).toBeVisible();
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-06-02: job done vẫn giữ draft chờ xác nhận', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp06-02');
    try {
      // 1. Job done không tự chuyển draft thành active.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'Await confirmation',
        status: 'draft',
        jobStatus: 'done',
      });
      await loginAs(page, user.email);
      await page.goto('/plans');
      await page.getByRole('tab', { name: 'Kế hoạch', exact: true }).click();
      await page.getByRole('tab', { name: /Chưa xác nhận/ }).click();
      await expect(page.getByText('Chờ xác nhận', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Kiểm chứng đồ thị', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/plan/${plan.id}/verify`));
      expect((await prisma.studyPlan.findUnique({ where: { id: plan.id } }))?.status).toBe('draft');
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });

  test('TC-SP-06-03: retry không nhân plan', async ({ page }) => {
    const user = await seedStudentWithoutPlan(prisma, 'sp06-03');
    try {
      // 1. Retry job lỗi và đếm số plan của user sau mutation.
      const plan = await seedPlannerPlan(prisma, user.id, {
        name: 'One draft only',
        status: 'draft',
        jobStatus: 'failed',
        withDocument: true,
      });
      await loginAs(page, user.email);
      const response = await authRequest(page, 'POST', `/api/v1/plans/${plan.id}/retry`);
      expect(response.status()).toBe(202);
      expect(await prisma.studyPlan.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await cleanupPlannerUser(prisma, user.id);
    }
  });
});
