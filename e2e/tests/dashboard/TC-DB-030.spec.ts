import { expect, test } from '@playwright/test';
import { createTestPrismaClient, loginViaUi } from '../focus-session/focus-session-test-utils';
import { seedDashboardData } from './dashboard-test-utils';

const prisma = createTestPrismaClient();

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-030: Nút Back sau khi đã rời Dashboard đến Interview/Focus', () => {
  test('Back từ màn hình thiết lập Focus trở về Dashboard đầy đủ mà không tạo session rỗng', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_030', { seedActivity: false });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-030 thiếu P1.');

      // 1. Đăng nhập Dashboard có gợi ý, graph, chỉ số và danh mục kế hoạch thật.
      await loginViaUi(page, seed.user.email);
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(3);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 2. Đi theo CTA Focus từ Dashboard và dừng ở setup, trước thao tác Bắt đầu tạo session.
      const focusLink = page.getByRole('link', { name: 'Bắt đầu Focus Session', exact: true });
      await Promise.all([
        page.waitForURL(new RegExp(`/focus\\?planId=${p1.id}&conceptId=`)),
        focusLink.click(),
      ]);
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();

      // 3. Nhấn Back của trình duyệt và xác nhận Dashboard render lại đầy đủ, không phải trang trắng.
      await page.goBack();
      await expect(page).toHaveURL('/dashboard');
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();
      await expect(page.locator('.react-flow__node')).toHaveCount(3);
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 4. Đối chiếu DB: chỉ navigate/back không được tạo Focus Session rỗng.
      await expect
        .poll(() => prisma.focusSession.count({ where: { userId: seed.user.id } }))
        .toBe(0);
    } finally {
      // 5. Dọn Student độc lập cùng mọi dữ liệu Dashboard sau khi test hoàn tất.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('Back rồi vào lại lối vào Interview tiếp tục đúng phiên đang dở, không tạo phiên thứ hai', async ({
    page,
  }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_030_resume', { seedActivity: false });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-030 resume thiếu P1.');
      const concept = await prisma.concept.findFirstOrThrow({
        where: { planId: p1.id, name: 'Concept C1' },
        select: { id: true },
      });
      // Khi server chạy AI thật, pre-check yêu cầu plan có tài liệu trước cả nhánh resume.
      await prisma.document.create({
        data: {
          planId: p1.id,
          filename: 'resume-source.pdf',
          fileKey: `tc-db-030-resume-${Date.now()}.pdf`,
        },
      });
      const existingSession = await prisma.interviewSession.create({
        data: {
          userId: seed.user.id,
          planId: p1.id,
          status: 'active',
          conceptQueue: [concept.id],
        },
        select: { id: true },
      });

      // 1. Đăng nhập Dashboard rồi dùng lối vào Interview cho kế hoạch đã có phiên đang dở.
      await loginViaUi(page, seed.user.email);
      const interviewLink = page.getByRole('link', {
        name: 'Vào thẳng phiên kiểm tra',
        exact: true,
      });
      const firstResumeResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/interviews' &&
          response.request().method() === 'POST'
      );
      await interviewLink.click();
      const firstResume = await firstResumeResponse;
      expect(firstResume.status()).toBe(200);
      await expect(firstResume.json()).resolves.toMatchObject({
        success: true,
        data: { created: false, session: { id: existingSession.id } },
      });
      await expect(
        page.getByRole('heading', { name: 'Bạn có một phiên đang dở', exact: true })
      ).toBeVisible();

      // 2. Nhấn Back để quay về Dashboard; phiên active vẫn tồn tại và Dashboard không trắng trang.
      await page.goBack();
      await expect(page).toHaveURL('/dashboard');
      await expect(page.getByRole('heading', { name: 'Concept C1', exact: true })).toBeVisible();

      // 3. Vào lại cùng lối vào; server phải trao lại phiên cũ thay vì tạo một bản ghi mới.
      const secondResumeResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/interviews' &&
          response.request().method() === 'POST'
      );
      await interviewLink.click();
      const secondResume = await secondResumeResponse;
      expect(secondResume.status()).toBe(200);
      await expect(secondResume.json()).resolves.toMatchObject({
        success: true,
        data: { created: false, session: { id: existingSession.id } },
      });
      await expect(
        page.getByRole('heading', { name: 'Bạn có một phiên đang dở', exact: true })
      ).toBeVisible();

      // 4. Đối chiếu DB: chỉ có duy nhất phiên active đã seed, không phát sinh phiên Interview mới.
      await expect
        .poll(() =>
          prisma.interviewSession.count({ where: { userId: seed.user.id, planId: p1.id } })
        )
        .toBe(1);
    } finally {
      // 5. Dọn Student độc lập cùng session đã seed sau khi test hoàn tất.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
