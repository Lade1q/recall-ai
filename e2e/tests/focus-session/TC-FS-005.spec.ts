import { expect, test, type Locator } from '@playwright/test';

import {
  attachMultiPagePdf,
  createTestPrismaClient,
  loginViaUi,
  removeSeededUpload,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const documentLevelLabels = ['Ẩn', 'Trích đoạn', 'Toàn văn'] as const;
type DocumentLevelLabel = (typeof documentLevelLabels)[number];

/** Đổi giá trị `MM:SS` trong timer thành giây để theo dõi timer qua các mức tài liệu. */
async function readClockSeconds(locator: Locator): Promise<number> {
  const text = await locator.textContent();
  const match = text?.match(/(\d{2}):(\d{2})/);
  if (!match) throw new Error(`Không đọc được giá trị MM:SS từ: ${text ?? '<null>'}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Xác minh segmented control chỉ đánh dấu đúng một mức tài liệu được chọn. */
async function expectSelectedDocumentLevel(
  documentControls: Locator,
  selectedLevel: DocumentLevelLabel
): Promise<void> {
  for (const label of documentLevelLabels) {
    await expect(
      documentControls.getByRole('button', { name: label, exact: true })
    ).toHaveAttribute('aria-pressed', label === selectedLevel ? 'true' : 'false');
  }
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-005: Chuyển mức hiển thị tài liệu trong phiên học', () => {
  test('Ẩn, Trích đoạn và Toàn văn giữ đúng source, timer và session ban đầu', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_005_document_levels');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const pdf = await attachMultiPagePdf(prisma, seed);

    try {
      // 1. Lấy source thật làm chuẩn đối chiếu excerpt và trang neo thay vì lặp dữ liệu seed trong test.
      const source = await prisma.conceptSourceRef.findFirstOrThrow({
        where: { conceptId: conceptC1.id, documentId: pdf.id },
        select: { documentId: true, pageFrom: true, pageTo: true, excerpt: true },
      });
      const sourcePageFrom = source.pageFrom;
      const sourceExcerpt = source.excerpt;
      if (sourcePageFrom === null || sourceExcerpt === null) {
        throw new Error('TC-FS-005 requires a PDF source with both page anchor and excerpt.');
      }
      const sourceAnchor =
        source.pageTo === null || source.pageTo === sourcePageFrom
          ? `tr. ${sourcePageFrom}`
          : `tr. ${sourcePageFrom}–${source.pageTo}`;

      // 2. Bắt đầu đúng một phiên C1 và chờ cả hai mức có tài liệu mở khóa sau khi source tải xong.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();

      const mainTimer = page.getByRole('timer');
      const documentControls = page.getByRole('group', {
        name: 'Hiển thị tài liệu',
        exact: true,
      });
      const hiddenButton = documentControls.getByRole('button', { name: 'Ẩn', exact: true });
      const excerptButton = documentControls.getByRole('button', {
        name: 'Trích đoạn',
        exact: true,
      });
      const fullTextButton = documentControls.getByRole('button', {
        name: 'Toàn văn',
        exact: true,
      });
      await expect(mainTimer).toBeVisible();
      await expect(excerptButton).not.toHaveAttribute('aria-disabled', 'true');
      await expect(fullTextButton).not.toHaveAttribute('aria-disabled', 'true');

      const originalSession = await prisma.focusSession.findFirstOrThrow({
        where: { userId: seed.user.id },
        select: { id: true, planId: true, conceptIds: true, status: true },
      });
      expect(originalSession).toEqual({
        id: expect.any(String),
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
        status: 'running',
      });
      const expectOriginalSessionOnly = async (): Promise<void> => {
        expect(
          await prisma.focusSession.findMany({
            where: { userId: seed.user.id },
            select: { id: true, planId: true, conceptIds: true, status: true },
          })
        ).toEqual([originalSession]);
      };

      // 3. Mức mặc định Ẩn có selected-state đúng; chọn lại không reset timer hoặc tạo session mới.
      await expectSelectedDocumentLevel(documentControls, 'Ẩn');
      await expect(page.getByRole('article')).toHaveCount(0);
      await expect(
        page.getByTitle(`Toàn văn tài liệu ${pdf.filename}`, { exact: true })
      ).toHaveCount(0);
      const remainingBeforeHidden = await readClockSeconds(mainTimer);
      await hiddenButton.click();
      await expectSelectedDocumentLevel(documentControls, 'Ẩn');
      await expect
        .poll(() => readClockSeconds(mainTimer), { timeout: 4_000 })
        .toBeLessThan(remainingBeforeHidden);
      const remainingAfterHidden = await readClockSeconds(mainTimer);
      await expectOriginalSessionOnly();

      // 4. Trích đoạn phải lấy đúng verbatim excerpt, filename và page range từ source của C1.
      await excerptButton.click();
      await expectSelectedDocumentLevel(documentControls, 'Trích đoạn');
      const excerptArticle = page.getByRole('article').filter({ hasText: sourceExcerpt });
      await expect(excerptArticle).toBeVisible();
      await expect(excerptArticle.getByText(pdf.filename, { exact: true })).toBeVisible();
      await expect(excerptArticle.getByText(sourceAnchor, { exact: true })).toBeVisible();
      await expect(excerptArticle.locator('mark')).toHaveText(sourceExcerpt);
      const compactTimer = page.locator('aside').getByText(/^\d{2}:\d{2}$/);
      await expect(compactTimer).toBeVisible();
      await expect
        .poll(() => readClockSeconds(compactTimer), { timeout: 4_000 })
        .toBeLessThan(remainingAfterHidden);
      const remainingAfterExcerpt = await readClockSeconds(compactTimer);
      await expectOriginalSessionOnly();

      // 5. Toàn văn tải đúng PDF và nhúng tại pageFrom của chính source, không quay về trang mặc định.
      const documentResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.url().includes(`/api/v1/plans/${seed.plan.id}/documents/${source.documentId}`)
      );
      await fullTextButton.click();
      const documentResponse = await documentResponsePromise;
      expect(documentResponse.status()).toBe(200);
      expect(documentResponse.headers()['content-type']).toContain('application/pdf');
      const documentBytes = await documentResponse.body();
      expect(documentBytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(documentBytes.byteLength).toBeGreaterThan(100_000);

      await expectSelectedDocumentLevel(documentControls, 'Toàn văn');
      await expect(excerptArticle).toHaveCount(0);
      const pdfFrame = page.getByTitle(`Toàn văn tài liệu ${pdf.filename}`, { exact: true });
      await expect(pdfFrame).toBeVisible();
      await expect(pdfFrame).toHaveAttribute('src', new RegExp(`^blob:.*#page=${sourcePageFrom}$`));
      await expect
        .poll(() => readClockSeconds(compactTimer), { timeout: 4_000 })
        .toBeLessThan(remainingAfterExcerpt);
      const remainingAfterFullText = await readClockSeconds(compactTimer);
      await expectOriginalSessionOnly();

      // 6. Quay về Ẩn phục hồi timer chính đang tiếp tục từ mốc cũ; PDF biến mất và S1 vẫn duy nhất.
      await hiddenButton.click();
      await expectSelectedDocumentLevel(documentControls, 'Ẩn');
      await expect(pdfFrame).toHaveCount(0);
      await expect(mainTimer).toBeVisible();
      await expect
        .poll(() => readClockSeconds(mainTimer), { timeout: 4_000 })
        .toBeLessThan(remainingAfterFullText);
      await expectOriginalSessionOnly();
    } finally {
      // 7. Dọn cả dữ liệu DB và đúng file vật lý được seed, kể cả khi một mức tài liệu lỗi.
      try {
        await prisma.user.delete({ where: { id: seed.user.id } });
      } finally {
        await removeSeededUpload(pdf.fileKey);
      }
    }
  });
});
