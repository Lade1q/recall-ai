import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readClockSeconds,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const initialNote = 'Định nghĩa cây nhị phân';
const editedNote = 'Định nghĩa cây nhị phân: mỗi nút có tối đa hai con';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedSession {
  id: string;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-006: Ghi chú nhanh liên kết concept và auto-save', () => {
  test('mở bằng nút/N, không làm lệch timer và giữ bản sửa mới nhất của C1', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_006');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

    try {
      // 1. Bắt đầu đúng một phiên C1 và lấy ID từ response thay vì tìm record theo thời gian.
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
      const startBody = (await startResponse.json()) as ApiEnvelope<CreatedSession>;
      const sessionId = startBody.data.id;

      const timer = page.getByRole('timer');
      const pauseButton = page.getByRole('button', { name: 'Tạm dừng', exact: true });
      const notesButton = page.getByRole('button', { name: 'Ghi chú nhanh', exact: true });
      const notesPanel = page.getByRole('complementary', {
        name: `Ghi chú nhanh cho khái niệm ${conceptC1.name}`,
        exact: true,
      });
      const noteInput = notesPanel.getByLabel(`Ghi chú cho khái niệm ${conceptC1.name}`, {
        exact: true,
      });
      await expect(timer).toBeVisible();
      await expect(pauseButton).toBeVisible();
      const timerBoxBeforeNotes = await timer.boundingBox();
      if (!timerBoxBeforeNotes) throw new Error('Timer has no layout box before opening notes.');
      const remainingBeforeNotes = await readClockSeconds(timer);

      // 2. Nút trên header mở rail nổi: timer vẫn ở nguyên vị trí và tiếp tục đếm.
      await notesButton.click();
      await expect(notesPanel).toBeVisible();
      await expect(notesPanel).toHaveCSS('position', 'absolute');
      await expect(notesButton).toHaveAttribute('aria-pressed', 'true');
      const timerBoxWithNotes = await timer.boundingBox();
      if (!timerBoxWithNotes) throw new Error('Timer has no layout box while notes are open.');
      expect(Math.abs(timerBoxWithNotes.x - timerBoxBeforeNotes.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(timerBoxWithNotes.y - timerBoxBeforeNotes.y)).toBeLessThanOrEqual(1);
      await expect
        .poll(() => readClockSeconds(timer), { timeout: 4_000 })
        .toBeLessThan(remainingBeforeNotes);
      await expect(pauseButton).toBeVisible();

      // 3. Đóng bằng nút rồi mở lại bằng phím N; panel tự đưa focus vào ô soạn của C1.
      await notesButton.click();
      await expect(notesPanel).toHaveCount(0);
      await page.keyboard.press('N');
      await expect(notesPanel).toBeVisible();
      await expect(noteInput).toBeFocused();
      await expect(notesButton).toHaveAttribute('aria-pressed', 'true');

      // 4. Lần nhập đầu POST đúng collection notes của session và neo record vào C1.
      const notesUrl = `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}/notes`;
      const createResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url() === notesUrl
      );
      await noteInput.fill(initialNote);
      expect((await createResponsePromise).status()).toBe(201);
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
      expect(
        await prisma.sessionNote.findMany({
          where: { sessionId },
          select: { sessionId: true, conceptId: true, body: true },
        })
      ).toEqual([{ sessionId, conceptId: conceptC1.id, body: initialNote }]);

      // 5. Sửa cùng ghi chú phải PATCH đúng hàng, không tạo bản sao hay giữ nội dung cũ.
      const updateResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' && response.url().startsWith(`${notesUrl}/`)
      );
      await noteInput.fill(editedNote);
      expect((await updateResponsePromise).status()).toBe(200);
      await expect(notesPanel.getByRole('status')).toHaveText(/^Đã lưu/);
      expect(
        await prisma.sessionNote.findMany({
          where: { sessionId },
          select: { sessionId: true, conceptId: true, body: true },
        })
      ).toEqual([{ sessionId, conceptId: conceptC1.id, body: editedNote }]);

      // 6. Đóng/mở rail nạp lại bản cuối từ server; session/timer vẫn đang chạy.
      await page.keyboard.press('Escape');
      await expect(notesPanel).toHaveCount(0);
      await page.keyboard.press('N');
      await expect(notesPanel.getByRole('listitem').filter({ hasText: editedNote })).toBeVisible();
      await expect(notesPanel.getByText(initialNote, { exact: true })).toHaveCount(0);
      await expect(pauseButton).toBeVisible();
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { status: true, endedAt: true },
        })
      ).toEqual({ status: 'running', endedAt: null });
    } finally {
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
