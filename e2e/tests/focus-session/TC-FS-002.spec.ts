import { test, expect } from '@playwright/test';
import * as path from 'path';

// Cần load env của server để Prisma đọc được DATABASE_URL.
require('../../../src/server/node_modules/dotenv').config({ path: path.join(__dirname, '../../../src/server/.env') });

// Root package không cài Prisma, nên dùng dependency của server. Prisma 7 bắt buộc có adapter.
const { PrismaClient } = require('../../../src/server/node_modules/@prisma/client');
const { PrismaPg } = require('../../../src/server/node_modules/@prisma/adapter-pg');
const bcrypt = require('../../../src/server/node_modules/bcryptjs');

let prisma: any;
const apiBaseUrl = (process.env.E2E_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

function createUniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
}

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run focus-session E2E tests.');
  }

  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

test.describe('TC-FS-002: Hiển thị thiết lập phiên và cấu hình Pomodoro mặc định', () => {
  test('Hiển thị đúng màn hình thiết lập, danh sách concept và mặc định Pomodoro 25 phút', async ({ page }) => {
    const email = createUniqueEmail('studentA');
    const password = 'SecurePassword123';

    const passwordHash = await bcrypt.hash(password, 10);
    const userA = await prisma.user.create({
      data: { email, passwordHash, name: 'Student A' },
    });

    try {
      // Thiết lập dữ liệu: P1 với C1, C2, C3
      const plan = await prisma.studyPlan.create({
        data: { userId: userA.id, name: 'Plan P1', status: 'active' },
      });
      const concept1 = await prisma.concept.create({
        data: { planId: plan.id, name: 'Concept C1', difficulty: 1, masteryScore: 0 },
      });
      const concept2 = await prisma.concept.create({
        data: { planId: plan.id, name: 'Concept C2', difficulty: 2, masteryScore: 0 },
      });
      const concept3 = await prisma.concept.create({
        data: { planId: plan.id, name: 'Concept C3', difficulty: 3, masteryScore: 0 },
      });

      // Để các concept hiển thị trong Focus Session (nếu vào từ /focus chung), 
      // chúng cần nằm trong ReviewQueueItem (hàng đợi ôn tập).
      await prisma.reviewQueueItem.create({
        data: {
          planId: plan.id,
          conceptId: concept1.id,
          priority: 1,
          reason: 'manual',
          scheduledFor: new Date(Date.now() - 5 * 60 * 1000), // Lùi lại 5 phút
        },
      });
      await prisma.reviewQueueItem.create({
        data: {
          planId: plan.id,
          conceptId: concept2.id,
          priority: 2,
          reason: 'manual',
          scheduledFor: new Date(Date.now() - 5 * 60 * 1000),
        },
      });
      await prisma.reviewQueueItem.create({
        data: {
          planId: plan.id,
          conceptId: concept3.id,
          priority: 3,
          reason: 'manual',
          scheduledFor: new Date(Date.now() - 5 * 60 * 1000),
        },
      });

      // 1. Đăng nhập
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Đăng nhập' }).click();
      await expect(page).toHaveURL(/.*\/dashboard/);

      // 2. Điểm vào 1: Vào Focus Session từ Dashboard
      await page.goto('/focus');
      
      // Quan sát màn hình thiết lập (Từ Dashboard) - Mặc định sẽ lấy ReviewQueueItem ưu tiên cao nhất (C1)
      await expect(page.getByRole('heading', { name: 'Concept C1' })).toBeVisible();
      
      // Kiểm tra thời lượng 25 phút mặc định
      await expect(page.getByText('25:00')).toBeVisible();
      await expect(page.getByText(/25 phút, nghỉ 5 phút/)).toBeVisible();

      // Nút bắt đầu hiển thị
      await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
      
      // Nút đổi độ dài lượt
      await expect(page.getByRole('button', { name: 'Đổi độ dài lượt' })).toBeVisible();
      
      // Kiểm tra chưa có record nào được tạo trong DB
      let sessionCount = await prisma.focusSession.count({
        where: { userId: userA.id }
      });
      expect(sessionCount).toBe(0);

      // 3. Điểm vào 2: Từ màn hình chi tiết môn học (qua deep-link /focus?planId=...&conceptId=...)
      await page.goto(`/focus?planId=${plan.id}&conceptId=${concept2.id}`);
      
      // Quan sát màn hình thiết lập (Từ Deep Link)
      // Màn hình cũng phải hiển thị thời lượng 25 phút
      await expect(page.getByText('25:00')).toBeVisible();
      await expect(page.getByText(/25 phút, nghỉ 5 phút/)).toBeVisible();

      // Concept 2 được pre-select (hiển thị) qua deep link
      await expect(page.getByRole('heading', { name: 'Concept C2' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();

      // Vẫn chưa có session chạy
      sessionCount = await prisma.focusSession.count({
        where: { userId: userA.id }
      });
      expect(sessionCount).toBe(0);

    } finally {
      await prisma.user.delete({ where: { id: userA.id } });
    }
  });
});
