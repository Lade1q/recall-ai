import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  attachMultiPagePdf,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  removeSeededUpload,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

async function dispatchVisibility(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((nextHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: nextHidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: nextHidden ? 'hidden' : 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function startSession(page: Page, strict = true): Promise<string> {
  await page.goto('/focus');
  const strictSwitch = page.getByRole('switch', { name: 'Chế độ nghiêm ngặt', exact: true });
  if (((await strictSwitch.getAttribute('aria-checked')) === 'true') !== strict) {
    await strictSwitch.click();
  }
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/focus-sessions')
  );
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const created = await response;
  expect(created.status()).toBe(201);
  return ((await created.json()) as { data: { id: string } }).data.id;
}

test.beforeAll(async () => prisma.$connect());
test.afterAll(async () => prisma.$disconnect());

test.describe('Focus Session — các case bổ sung FS-02/04/05/06', () => {
  test('TC-FS-027: kẹp các trường Pomodoro về đúng biên', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_027');
    try {
      // 1. Mở panel trước khi bắt đầu và thử các giá trị ngoài biên.
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await page.getByRole('button', { name: 'Đổi độ dài lượt', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Cấu hình Pomodoro', exact: true });
      const fields = dialog.locator('input[type="number"]');
      await fields.nth(0).fill('0');
      await expect(fields.nth(0)).toHaveValue('1');
      await fields.nth(0).fill('-5');
      await expect(fields.nth(0)).toHaveValue('1');
      await fields.nth(0).fill('200');
      await expect(fields.nth(0)).toHaveValue('120');
      await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
      await expect(page.getByText('120 phút', { exact: false })).toBeVisible();
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('TC-FS-028: strict ON tạm dừng timer khi rời tab, OFF tiếp tục timer', async ({
    page,
    context,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_028');
    const otherPage = await context.newPage();
    try {
      // 1. Dùng clock ảo và tab phụ để phát visibilitychange ổn định trong headless browser.
      await loginViaUi(page, seed.user.email);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 60_000));
      await otherPage.goto('about:blank');
      await page.bringToFront();
      await startSession(page, true);
      const timer = page.getByRole('timer');
      const beforeStrict = await readClockSeconds(timer);
      await otherPage.bringToFront();
      await dispatchVisibility(page, true);
      await page.clock.runFor(5_000);
      await page.bringToFront();
      await dispatchVisibility(page, false);
      // 2. Strict ON phải hiện cảnh báo và giữ nguyên số giây còn lại.
      await expect(
        page.getByRole('heading', { name: 'Đồng hồ tập trung đã dừng', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      const afterStrict = await readClockSeconds(timer);
      expect(afterStrict).toBeGreaterThanOrEqual(beforeStrict - 1);
      expect(afterStrict).toBeLessThanOrEqual(beforeStrict);

      // Gọi lại cảnh báo để chọn nhánh tắt strict ngay trong phiên.
      await otherPage.bringToFront();
      await dispatchVisibility(page, true);
      await page.clock.runFor(1_000);
      await page.bringToFront();
      await dispatchVisibility(page, false);
      await expect(
        page.getByRole('button', { name: 'Tắt chế độ nghiêm ngặt', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Tắt chế độ nghiêm ngặt', exact: true }).click();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor();
      const beforeLoose = await readClockSeconds(timer);
      await otherPage.bringToFront();
      await dispatchVisibility(page, true);
      await page.clock.runFor(5_000);
      await page.bringToFront();
      await dispatchVisibility(page, false);
      // 3. Tắt strict từ cảnh báo; lần rời tiếp theo tiếp tục trừ timer.
      expect(await readClockSeconds(timer)).toBeLessThan(beforeLoose);
    } finally {
      await otherPage.close().catch(() => undefined);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('TC-FS-029: tài liệu text có thể mở toàn văn trong phiên', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_029');
    const fileKey = `e2e-focus-text-${Date.now()}.txt`;
    const uploadPath = path.join(__dirname, '../../../src/server/uploads', fileKey);
    try {
      // 1. Tạo Document kind=text thật, không giả lập response của API tài liệu.
      const textBody = 'Nội dung văn bản kiểm thử Focus.';
      await fs.promises.writeFile(uploadPath, textBody);
      const document = await prisma.document.create({
        data: {
          planId: seed.plan.id,
          filename: 'ghi-chu.txt',
          fileKey,
          kind: 'text',
          pageCount: null,
          byteSize: Buffer.byteLength(textBody, 'utf8'),
        },
        select: { id: true },
      });
      await prisma.conceptSourceRef.create({
        data: {
          conceptId: seed.concepts[0].id,
          documentId: document.id,
          excerpt: textBody,
        },
      });
      await loginViaUi(page, seed.user.email);
      await startSession(page);
      const fullTextButton = page.getByRole('button', { name: 'Toàn văn', exact: true });
      await expect(fullTextButton).not.toHaveAttribute('aria-disabled', 'true');
      await fullTextButton.click();
      await expect(page.getByTitle('Toàn văn tài liệu ghi-chu.txt')).toBeVisible();
      // Khi mở tài liệu, UI đổi sang bố cục hai cột và đồng hồ được trình bày bằng chữ trong aside.
      await expect(page.getByText(/Còn lại · Pomodoro/)).toBeVisible();
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
      await removeSeededUpload(fileKey);
    }
  });

  test('TC-FS-030: PDF nhiều trang không block timer và chuyển segment', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_030');
    let document: { fileKey: string } | null = null;
    try {
      // 1. Gắn PDF fixture nhiều trang, mở toàn văn rồi quay lại trích đoạn.
      document = await attachMultiPagePdf(prisma, seed);
      await loginViaUi(page, seed.user.email);
      await startSession(page);
      const fullTextButton = page.getByRole('button', { name: 'Toàn văn', exact: true });
      await expect(fullTextButton).not.toHaveAttribute('aria-disabled', 'true');
      await fullTextButton.click();
      const fullText = page.getByTitle(/Toàn văn tài liệu/);
      await expect(fullText).toBeVisible();
      // Khi tài liệu mở, đồng hồ được trình bày trong aside thay vì vòng SVG role=timer.
      const documentTimer = page.locator('aside').locator('div.font-mono').first();
      const before = await readClockSeconds(documentTimer);
      // PDF plugin nằm trong iframe; cuộn viewport của iframe để mô phỏng đọc trang dài.
      await fullText.evaluate((element) => {
        (element as HTMLIFrameElement).contentWindow?.scrollTo(0, 5000);
      });
      // Khi mở tài liệu, vòng đồng hồ role=timer được thay bằng đồng hồ chữ trong cột trạng thái.
      await expect(page.getByText(/Còn lại · Pomodoro/)).toBeVisible();
      const excerptButton = page.getByRole('button', { name: 'Trích đoạn', exact: true });
      await expect(excerptButton).not.toHaveAttribute('aria-disabled', 'true');
      await excerptButton.click();
      await expect(page.getByText(/Search algorithms compare/)).toBeVisible();
      // Việc đổi segment không reset timer; làm tròn theo giây có thể tăng tối đa 1 giây giữa hai
      // lần đọc nên chấp nhận sai số hiển thị này nhưng vẫn bắt được reset về thời lượng ban đầu.
      await expect.poll(() => readClockSeconds(documentTimer)).toBeLessThanOrEqual(before + 1);
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
      if (document) await removeSeededUpload(document.fileKey);
    }
  });

  test('TC-FS-031: ghi chú hơn 1000 ký tự và ký tự đặc biệt được auto-save', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_031');
    try {
      // 1. Gõ note dài qua UI và commit để server auto-save tạo SessionNote.
      await loginViaUi(page, seed.user.email);
      const sessionId = await startSession(page);
      await page.getByRole('button', { name: 'Ghi chú nhanh', exact: true }).click();
      const body = `${'Ghi chú tiếng Việt — '.repeat(70)}🚀 <b>HTML</b>`;
      const textarea = page.getByRole('textbox', {
        name: new RegExp(`Ghi chú cho khái niệm ${seed.concepts[0].name}`),
      });
      await textarea.fill(body);
      const saveNote = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith(`/api/v1/focus-sessions/${sessionId}/notes`)
      );
      await page.getByRole('button', { name: 'Ghi chú mới', exact: true }).click();
      await expect((await saveNote).status()).toBe(201);
      await expect(page.getByRole('listitem').filter({ hasText: '🚀 <b>HTML</b>' })).toBeVisible();
      const note = await prisma.sessionNote.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      });
      expect(note?.body).toBe(body);
      expect(note?.conceptId).toBe(seed.concepts[0].id);
      // 2. Phiên vừa tạo dưới một phút sẽ bị cơ chế dọn orphan hủy khi reload; dữ liệu đã được
      // xác minh qua response và DB ở trên, nên không reload để tránh biến ca lưu note thành ca
      // khôi phục phiên chưa đủ ngưỡng 60 giây.
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('TC-FS-032: traceback đứng trước item priority thấp hơn trong Focus', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_032');
    try {
      // 1. Đặt traceback cạnh một item priority cao để kiểm tra tier của scheduler.
      const tracebackItem = await prisma.reviewQueueItem.findFirstOrThrow({
        where: { planId: seed.plan.id, conceptId: seed.concepts[0].id },
        select: { id: true },
      });
      const spacedItem = await prisma.reviewQueueItem.findFirstOrThrow({
        where: { planId: seed.plan.id, conceptId: seed.concepts[1].id },
        select: { id: true },
      });
      await prisma.reviewQueueItem.update({
        where: { id: tracebackItem.id },
        data: { reason: 'traceback', depth: 1, priority: 1 },
      });
      await prisma.reviewQueueItem.update({
        where: { id: spacedItem.id },
        data: { reason: 'spaced_repetition', priority: 100 },
      });
      await loginViaUi(page, seed.user.email);
      await page.goto('/focus');
      await expect(
        page.getByRole('heading', { name: seed.concepts[0].name, exact: true })
      ).toBeVisible();
      await expect(page.getByText(/Truy ngược/)).toBeVisible();
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('TC-FS-033: hoàn thành Focus chỉ tạo session, không đổi review queue', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_033');
    try {
      // 1. Chụp queue trước khi hoàn thành Focus.
      const before = await prisma.reviewQueueItem.findMany({
        where: { planId: seed.plan.id },
        orderBy: { conceptId: 'asc' },
        select: { conceptId: true, status: true, scheduledFor: true, priority: true, reason: true },
      });
      await loginViaUi(page, seed.user.email);
      await startSession(page);
      const completion = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().includes('/api/v1/focus-sessions/')
      );
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      expect((await completion).status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();
      // 2. Queue sau completion phải byte-for-byte tương đương snapshot trước đó.
      const after = await prisma.reviewQueueItem.findMany({
        where: { planId: seed.plan.id },
        orderBy: { conceptId: 'asc' },
        select: { conceptId: true, status: true, scheduledFor: true, priority: true, reason: true },
      });
      expect(after).toEqual(before);
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
