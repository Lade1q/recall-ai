import * as fs from 'fs';
import * as path from 'path';
import { expect, test, type Page, type Route } from '@playwright/test';

import {
  API_BASE_URL,
  attachMultiPagePdf,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  removeSeededUpload,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const documentErrorText = 'Chưa mở được tài liệu. Kiểm tra kết nối rồi thử lại.';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

interface SeededDocument {
  id: string;
  filename: string;
  fileKey: string;
}

/** Tạo document/source C1 chỉ có metadata, cố ý không tạo object để backend thật trả 404. */
async function seedMissingDocument(seed: FocusPlanSeed): Promise<SeededDocument> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
  const fileKey = `e2e-focus-missing-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const document = await prisma.document.create({
    data: {
      planId: seed.plan.id,
      filename: 'missing-document.pdf',
      fileKey,
      kind: 'pdf',
      pageCount: 1,
      byteSize: 1_024,
    },
    select: { id: true, filename: true, fileKey: true },
  });
  await prisma.conceptSourceRef.create({
    data: {
      conceptId: conceptC1.id,
      documentId: document.id,
      pageFrom: 1,
      pageTo: 1,
      excerpt: 'Trích đoạn còn trong DB nhưng file gốc đã bị mất.',
    },
  });
  return document;
}

/** Gắn bytes text thật nhưng khai báo là PDF/.docx để kiểm đường HTTP 200 nhưng renderer không đọc được. */
async function attachInvalidPdfBytes(seed: FocusPlanSeed): Promise<SeededDocument> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
  const filename = 'not-a-pdf.docx';
  const fileKey = `e2e-focus-invalid-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`;
  const sourcePath = path.join(__dirname, '../../../docs/guidelines/coding-conventions.md');
  const uploadDirectory = path.join(__dirname, '../../../src/server/uploads');
  const uploadedPath = path.join(uploadDirectory, fileKey);
  await fs.promises.mkdir(uploadDirectory, { recursive: true });
  await fs.promises.copyFile(sourcePath, uploadedPath);
  const stats = await fs.promises.stat(uploadedPath);

  try {
    const document = await prisma.document.create({
      data: {
        planId: seed.plan.id,
        filename,
        fileKey,
        // Metadata PDF mô phỏng URL/file bị thay bằng .docx sau khi đã tạo source PDF.
        kind: 'pdf',
        pageCount: 1,
        byteSize: stats.size,
      },
      select: { id: true, filename: true, fileKey: true },
    });
    await prisma.conceptSourceRef.create({
      data: {
        conceptId: conceptC1.id,
        documentId: document.id,
        pageFrom: 1,
        pageTo: 1,
        excerpt: 'Source metadata nói PDF nhưng storage chứa nội dung không phải PDF.',
      },
    });
    return document;
  } catch (error) {
    await fs.promises.unlink(uploadedPath).catch(() => undefined);
    throw error;
  }
}

/** Bắt đầu phiên C1 và lấy session ID từ response thật trước khi kiểm tra document. */
async function startUiSession(page: Page, seed: FocusPlanSeed): Promise<string> {
  await loginViaUi(page, seed.user.email);
  await page.goto('/focus');
  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
  );
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(201);
  const body = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
  await prisma.focusSession.update({
    where: { id: body.data.id },
    data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
  });
  await expect(page.getByRole('button', { name: 'Toàn văn', exact: true })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  );
  return body.data.id;
}

/** Sau lỗi tài liệu, chứng minh timer, note, điều khiển và record vẫn hoạt động độc lập. */
async function verifySessionContinues(
  page: Page,
  seed: FocusPlanSeed,
  sessionId: string,
  noteBody: string
): Promise<void> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

  // 1. Đồng hồ rút gọn vẫn giảm trong khi khung tài liệu đang ở trạng thái lỗi.
  const compactTimer = page.locator('aside').getByText(/^\d{2}:\d{2}$/);
  await expect(compactTimer).toBeVisible();
  const remainingBefore = await readClockSeconds(compactTimer);
  await expect
    .poll(() => readClockSeconds(compactTimer), { timeout: 4_000 })
    .toBeLessThan(remainingBefore);

  // 2. Mở ghi chú, POST thật và đối chiếu đúng note C1 trong DB.
  await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
  const notesPanel = page.getByRole('complementary', {
    name: `Ghi chú nhanh cho khái niệm ${conceptC1.name}`,
    exact: true,
  });
  const noteInput = notesPanel.getByLabel(`Ghi chú cho khái niệm ${conceptC1.name}`, {
    exact: true,
  });
  const notesUrl = `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`;
  const noteResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url() === notesUrl
  );
  await noteInput.fill(noteBody);
  expect((await noteResponsePromise).status()).toBe(201);
  await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
  expect(
    await prisma.sessionNote.findMany({
      where: { sessionId },
      select: { conceptId: true, body: true },
    })
  ).toEqual([{ conceptId: conceptC1.id, body: noteBody }]);

  // 3. Đóng ghi chú, ẩn tài liệu, tạm dừng và hoàn tất cùng session qua API thật.
  await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
  const hideDocumentButton = page.getByRole('button', { name: 'Ẩn', exact: true });
  await expect(hideDocumentButton).toBeVisible();
  await hideDocumentButton.click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  const endResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
  );
  await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
  expect((await endResponsePromise).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Xong phiên học', exact: true })).toBeVisible();

  // 4. Record sau cùng đầy đủ, duy nhất và không bị lỗi document làm mất thời gian/note.
  const sessions = await prisma.focusSession.findMany({
    where: { userId: seed.user.id },
    select: {
      id: true,
      status: true,
      conceptIds: true,
      focusedSeconds: true,
      endedAt: true,
      notes: { select: { body: true } },
    },
  });
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({
    id: sessionId,
    status: 'completed',
    conceptIds: [conceptC1.id],
    endedAt: expect.any(Date),
    notes: [{ body: noteBody }],
  });
  expect(sessions[0]?.focusedSeconds).toBeGreaterThan(0);
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-021: PDF lỗi nhưng phiên học vẫn tiếp tục', () => {
  test('a) File vật lý bị mất trả 404 và UI graceful-degrade', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_021_404');
    const document = await seedMissingDocument(seed);

    try {
      // 1. Mở toàn văn và chờ endpoint backend thật xác nhận object storage không còn file.
      const sessionId = await startUiSession(page, seed);
      const documentUrl = `${API_BASE_URL}/api/v1/plans/${seed.plan.id}/documents/${document.id}`;
      const responsePromise = page.waitForResponse(
        (response) => response.request().method() === 'GET' && response.url() === documentUrl
      );
      await page.getByRole('button', { name: 'Toàn văn', exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(404);

      // 2. Khung phải hết loading, hiện thông báo và lối quay lại trích đoạn.
      await expect(page.getByText(documentErrorText, { exact: true })).toBeVisible();
      await expect(page.getByText('Đang mở tài liệu…', { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Quay lại trích đoạn', exact: true })
      ).toBeVisible();

      // 3. Lỗi 404 không được ảnh hưởng timer, note, completion và DB record.
      await verifySessionContinues(page, seed, sessionId, 'Ghi chú vẫn lưu khi PDF trả 404.');
    } finally {
      // 4. Metadata/object thiếu được dọn theo cascade User; không có file vật lý cần xóa.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Transport timeout của riêng request PDF hiện fallback và không chặn phiên', async ({
    page,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_021_timeout');
    const document = await attachMultiPagePdf(prisma, seed);
    const documentUrl = `${API_BASE_URL}/api/v1/plans/${seed.plan.id}/documents/${document.id}`;
    let documentRequests = 0;
    const timeoutHandler = async (route: Route) => {
      expect(route.request().method()).toBe('GET');
      documentRequests += 1;
      await route.abort('timedout');
    };

    try {
      // 1. Fault-inject đúng boundary GET bytes; login, source, note và session API vẫn thật.
      await page.route(documentUrl, timeoutHandler);
      const sessionId = await startUiSession(page, seed);
      const failedRequestPromise = page.waitForEvent('requestfailed', {
        predicate: (failedRequest) =>
          failedRequest.method() === 'GET' && failedRequest.url() === documentUrl,
      });
      await page.getByRole('button', { name: 'Toàn văn', exact: true }).click();
      expect((await failedRequestPromise).failure()?.errorText).toBeTruthy();
      // React StrictMode ở dev có thể mount effect hai lượt; mọi lượt đều bị chặn đúng boundary.
      expect(documentRequests).toBeGreaterThanOrEqual(1);

      // 2. UI phải thoát spinner và trình bày cùng fallback rõ ràng như lỗi HTTP.
      await expect(page.getByText(documentErrorText, { exact: true })).toBeVisible();
      await expect(page.getByText('Đang mở tài liệu…', { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Quay lại trích đoạn', exact: true })
      ).toBeVisible();

      // 3. Timer, ghi chú và completion thật vẫn độc lập với transport fault của PDF.
      await verifySessionContinues(page, seed, sessionId, 'Ghi chú vẫn lưu khi PDF timeout.');
    } finally {
      // 4. Luôn tháo fault route, cascade DB rồi xóa đúng file PDF fixture.
      await page.unroute(documentUrl, timeoutHandler).catch(() => undefined);
      try {
        await prisma.user.delete({ where: { id: seed.user.id } });
      } finally {
        await removeSeededUpload(document.fileKey);
      }
    }
  });

  test('c) Bytes không phải PDF phải được app phát hiện dù endpoint trả 200', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_021_invalid');
    const document = await attachInvalidPdfBytes(seed);

    try {
      // 1. File storage thật không có magic PDF nhưng metadata khiến endpoint trả application/pdf.
      const sessionId = await startUiSession(page, seed);
      const documentUrl = `${API_BASE_URL}/api/v1/plans/${seed.plan.id}/documents/${document.id}`;
      const responsePromise = page.waitForResponse(
        (response) => response.request().method() === 'GET' && response.url() === documentUrl
      );
      await page.getByRole('button', { name: 'Toàn văn', exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect((await response.body()).subarray(0, 5).toString()).not.toBe('%PDF-');

      // 2. HTTP 200 không đồng nghĩa render thành công: app vẫn phải hiện lỗi thay vì iframe hỏng.
      await expect
        .soft(
          page.getByText(documentErrorText, { exact: true }),
          'Chưa implement kiểm tra bytes/renderer error cho file không phải PDF nhưng HTTP 200'
        )
        .toBeVisible({ timeout: 2_000 });
      await expect(page.getByText('Đang mở tài liệu…', { exact: true })).toHaveCount(0);

      // 3. Dù thiếu thông báo lỗi renderer, phần còn lại vẫn phải lưu timer/note/session đầy đủ.
      await verifySessionContinues(
        page,
        seed,
        sessionId,
        'Ghi chú vẫn lưu khi bytes không phải PDF.'
      );
    } finally {
      // 4. Cascade DB và luôn xóa object không-PDF đã copy vào storage local.
      try {
        await prisma.user.delete({ where: { id: seed.user.id } });
      } finally {
        await removeSeededUpload(document.fileKey);
      }
    }
  });
});
