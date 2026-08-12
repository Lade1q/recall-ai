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

test.describe('TC-DB-009: Zoom và pan graph không làm sai dữ liệu', () => {
  test('Điều hướng canvas giữ panel đúng node và không ghi dữ liệu nghiệp vụ', async ({ page }) => {
    const seed = await seedDashboardData(prisma, 'tc_db_009', {
      emptyQueue: true,
      seedActivity: false,
    });

    try {
      const [p1] = seed.plans;
      if (!p1) throw new Error('Seed TC-DB-009 thiếu P1.');

      // 1. Chụp dữ liệu nghiệp vụ trước mọi thao tác điều hướng trên canvas.
      const before = await prisma.studyPlan.findUniqueOrThrow({
        where: { id: p1.id },
        select: {
          concepts: {
            orderBy: { name: 'asc' },
            select: { id: true, name: true, masteryScore: true, lastTestedAt: true },
          },
          conceptEdges: {
            orderBy: { id: 'asc' },
            select: { id: true, fromConceptId: true, toConceptId: true },
          },
        },
      });

      // 2. Đăng nhập và mở graph đầy đủ ở chế độ xem.
      await loginViaUi(page, seed.user.email);
      await page.goto(`/plan/${p1.id}`);
      await expect(page).toHaveURL(`/plan/${p1.id}`);

      // 3. Chọn C2 để panel là điểm tham chiếu khi zoom/pan canvas.
      const conceptC2 = page.locator('.react-flow__node').filter({ hasText: 'Concept C2' });
      const detailResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.includes(`/api/v1/plans/${p1.id}/concepts/`) &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await conceptC2.click();
      await detailResponse;
      const panelC2 = page.locator('main aside').filter({
        has: page.getByRole('heading', { name: 'Concept C2', exact: true }),
      });
      await expect(panelC2).toBeVisible();

      // 4. Zoom in/out qua control thật và kiểm tra mức zoom thay đổi hữu hạn.
      const zoomIn = page.locator('button[title="Phóng to"]');
      const zoomOut = page.locator('button[title="Thu nhỏ"]');
      const viewportControls = zoomIn.locator('xpath=..');
      const zoomLabel = viewportControls.locator('span').filter({ hasText: /^\d+%$/ });
      const initialZoom = await zoomLabel.innerText();
      await zoomOut.click();
      await expect(zoomLabel).not.toHaveText(initialZoom);
      const zoomedOut = await zoomLabel.innerText();
      await zoomIn.click();
      await expect(zoomLabel).not.toHaveText(zoomedOut);

      // 5. Pan vùng trống của canvas; panel đang chọn không được biến mất hoặc trỏ nhầm node.
      const pane = page.locator('.react-flow__pane').first();
      const box = await pane.boundingBox();
      if (!box) throw new Error('Không xác định được vùng pan của graph.');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 40);
      await page.mouse.up();
      await expect(panelC2).toBeVisible();

      // 6. Reload rồi chọn lại C2 để xác nhận graph vẫn đọc dữ liệu thật, không bị thao tác view sửa.
      await page.reload();
      const reloadedC2 = page.locator('.react-flow__node').filter({ hasText: 'Concept C2' });
      const reloadedResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.includes(`/api/v1/plans/${p1.id}/concepts/`) &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await reloadedC2.click();
      await reloadedResponse;
      await expect(
        page.locator('main aside').filter({
          has: page.getByRole('heading', { name: 'Concept C2', exact: true }),
        })
      ).toBeVisible();

      // 7. Đối chiếu DB sau reload: view mode không được tạo/xóa/sửa concept hoặc edge.
      const after = await prisma.studyPlan.findUniqueOrThrow({
        where: { id: p1.id },
        select: {
          concepts: {
            orderBy: { name: 'asc' },
            select: { id: true, name: true, masteryScore: true, lastTestedAt: true },
          },
          conceptEdges: {
            orderBy: { id: 'asc' },
            select: { id: true, fromConceptId: true, toConceptId: true },
          },
        },
      });
      expect(after).toEqual(before);
    } finally {
      // 8. Dọn toàn bộ dữ liệu seed qua user sau khi mọi kiểm tra DB kết thúc.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
