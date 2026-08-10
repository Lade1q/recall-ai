import { expect, test, type Locator } from '@playwright/test';

import {
  attachMultiPagePdf,
  createTestPrismaClient,
  loginViaUi,
  removeSeededUpload,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

/** Đổi giá trị `MM:SS` trong timer thành giây để theo dõi timer qua thao tác PDF. */
async function readClockSeconds(locator: Locator): Promise<number> {
  const text = await locator.textContent();
  const match = text?.match(/(\d{2}):(\d{2})/);
  if (!match) throw new Error(`Không đọc được giá trị MM:SS từ: ${text ?? '<null>'}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-005: Hiển thị tài liệu PDF song song trong phiên học', () => {
  test('1) Mở PDF nhiều trang trong iframe và timer tiếp tục chạy khi cuộn tài liệu', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_005_pdf');
    const pdf = await attachMultiPagePdf(prisma, seed);

    try {
      // 1. Đăng nhập và bắt đầu phiên Pomodoro đang chạy cho C1.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const timer = page.getByRole('timer');
      await expect(timer).toBeVisible();

      // 2. Chờ source của C1 tải xong rồi chọn mức Toàn văn.
      const fullTextButton = page.getByRole('button', { name: 'Toàn văn', exact: true });
      await expect(fullTextButton).not.toHaveAttribute('aria-disabled', 'true');
      const documentResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/v1/plans/${seed.plan.id}/documents/${pdf.id}`)
      );
      const remainingBeforeDocument = await readClockSeconds(timer);
      await fullTextButton.click();
      const documentResponse = await documentResponsePromise;

      // 3. Xác minh server trả đúng bytes PDF và UI nhúng file tại trang neo đầu tiên.
      expect(documentResponse.status()).toBe(200);
      expect(documentResponse.headers()['content-type']).toContain('application/pdf');
      const documentBytes = await documentResponse.body();
      expect(documentBytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(documentBytes.byteLength).toBeGreaterThan(100_000);
      const pdfFrame = page.getByTitle(`Toàn văn tài liệu ${pdf.filename}`, { exact: true });
      await expect(pdfFrame).toBeVisible();
      await expect(pdfFrame).toHaveAttribute('src', /^blob:.*#page=1$/);
      const compactTimer = page.locator('aside').getByText(/^\d{2}:\d{2}$/);
      await expect(compactTimer).toBeVisible();

      // 4. Đưa con trỏ vào viewer và cuộn như người dùng đọc tài liệu nhiều trang.
      await pdfFrame.hover();
      await page.mouse.wheel(0, 700);

      // 5. Timer phải tiếp tục giảm, không reset và session DB vẫn là cùng một phiên running.
      await expect
        .poll(() => readClockSeconds(compactTimer), { timeout: 4_000 })
        .toBeLessThan(remainingBeforeDocument);
      const sessions = await prisma.focusSession.findMany({
        where: { userId: seed.user.id },
        select: { id: true, status: true },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.status).toBe('running');

      // 6. Trở về màn timer, tạm dừng rồi kết thúc phiên qua UI để tránh record treo.
      await page.getByRole('button', { name: 'Ẩn', exact: true }).click();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
    } finally {
      // 7. Dọn cả dữ liệu DB và đúng file vật lý được seed, kể cả khi viewer/assertion lỗi.
      try {
        await prisma.user.delete({ where: { id: seed.user.id } });
      } finally {
        await removeSeededUpload(pdf.fileKey);
      }
    }
  });

  test('2) Panel ghi chú tạm thay vùng PDF nhưng bảo toàn timer, note và mức tài liệu', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_005_notes');
    const pdf = await attachMultiPagePdf(prisma, seed);

    try {
      // 1. Đăng nhập, bắt đầu phiên và mở PDF toàn văn trong khung trái.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      const fullTextButton = page.getByRole('button', { name: 'Toàn văn', exact: true });
      await expect(fullTextButton).not.toHaveAttribute('aria-disabled', 'true');
      await fullTextButton.click();
      const pdfFrame = page.getByTitle(`Toàn văn tài liệu ${pdf.filename}`, { exact: true });
      await expect(pdfFrame).toBeVisible();
      const compactTimer = page.locator('aside').getByText(/^\d{2}:\d{2}$/);
      const remainingBeforeNotes = await readClockSeconds(compactTimer);

      // 2. Mở ghi chú: vùng tài liệu tạm ẩn có chủ đích nhưng timer chính phải tiếp tục chạy.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await expect(pdfFrame).toHaveCount(0);
      const timer = page.getByRole('timer');
      await expect(timer).toBeVisible();
      await expect
        .poll(() => readClockSeconds(timer), { timeout: 4_000 })
        .toBeLessThan(remainingBeforeNotes);

      // 3. Nhập ghi chú và chờ auto-save thật trước khi đóng panel.
      const noteBody = 'Nội dung ghi chú phải được giữ khi đang đọc PDF.';
      const noteInput = page.getByLabel('Ghi chú cho khái niệm Concept C1', { exact: true });
      await noteInput.fill(noteBody);
      await expect(noteInput).toHaveValue(noteBody);
      await expect(page.getByText(/^Đã lưu \d{2}:\d{2}$/)).toBeVisible();
      const savedNote = await prisma.sessionNote.findFirstOrThrow({
        where: { session: { userId: seed.user.id } },
        select: { body: true, conceptId: true },
      });
      expect(savedNote.body).toBe(noteBody);
      expect(savedNote.conceptId).toBe(seed.concepts[0]?.id);

      // 4. Đóng ghi chú phải phục hồi đúng mức Toàn văn đã chọn, không reset timer/session.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      await expect(pdfFrame).toBeVisible();
      await expect(pdfFrame).toHaveAttribute('src', /^blob:.*#page=1$/);
      await expect(compactTimer).toBeVisible();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);

      // 5. Mở lại ghi chú và xác minh nội dung đã lưu được nạp lại từ API.
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const notePanel = page.getByRole('complementary', {
        name: 'Ghi chú nhanh cho khái niệm Concept C1',
        exact: true,
      });
      await expect(notePanel.getByRole('listitem').filter({ hasText: noteBody })).toBeVisible();
    } finally {
      // 6. Cascade cleanup DB và xóa file PDF seed chính xác.
      try {
        await prisma.user.delete({ where: { id: seed.user.id } });
      } finally {
        await removeSeededUpload(pdf.fileKey);
      }
    }
  });
});
