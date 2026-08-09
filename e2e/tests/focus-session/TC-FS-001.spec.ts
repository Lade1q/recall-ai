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

test.describe('TC-FS-001: Điều kiện tiên quyết Focus Session', () => {
  test('a) Chưa đăng nhập: Redirect về /login và API trả lỗi 401', async ({ page, request }) => {
    // UI Check
    await page.goto('/focus');
    await expect(page).toHaveURL(/.*\/login/);

    // API Check
    // `request` dùng baseURL của Playwright (frontend :5173), còn API chạy ở :3001.
    const response = await request.post(`${apiBaseUrl}/api/v1/focus-sessions`, {
      data: { planId: 'dummy', conceptIds: ['dummy'] },
    });
    expect(response.status()).toBe(401);
  });

  test('b) Đã đăng nhập, chưa có kế hoạch: Không cho bắt đầu, hiển thị CTA', async ({ page }) => {
    const email = createUniqueEmail('studentC');
    const password = 'SecurePassword123';

    // Seed user Student C (no plan) directly via Prisma
    const passwordHash = await bcrypt.hash(password, 10);
    const userC = await prisma.user.create({
      data: { email, passwordHash, name: 'Student C' },
    });

    try {
      // Thực hiện đăng nhập qua UI
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Đăng nhập' }).click();

      // Đợi chuyển trang về dashboard
      await expect(page).toHaveURL(/.*\/dashboard/);

      // Vào màn hình Focus. Đây là nhánh no-plan, không phải nhánh active plan chưa có queue.
      await page.goto('/focus');
      await expect(
        page.getByRole('heading', { name: 'Bạn chưa có kế hoạch ôn tập nào đang hoạt động.' })
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Tạo kế hoạch đầu tiên' })).toBeVisible();
    } finally {
      // Quan hệ trong schema cascade từ User xuống plan/concept/queue item.
      await prisma.user.delete({ where: { id: userC.id } });
    }
  });

  test('c) Đã đăng nhập, có kế hoạch P1: Hiển thị concept đến hạn', async ({ page }) => {
    const email = createUniqueEmail('studentA');
    const password = 'SecurePassword123';

    // `/focus` chỉ lấy các ReviewQueueItem đến hạn từ `/review-queue/today`.
    // Vì vậy, một plan có concepts đơn thuần chưa đủ để hiện Concept C1.
    const passwordHash = await bcrypt.hash(password, 10);
    const userA = await prisma.user.create({
      data: { email, passwordHash, name: 'Student A' },
    });

    try {
      const plan = await prisma.studyPlan.create({
        data: { userId: userA.id, name: 'Plan P1', status: 'active' },
      });
      const concept1 = await prisma.concept.create({
        data: { planId: plan.id, name: 'Concept C1', difficulty: 1, masteryScore: 0 },
      });
      await prisma.concept.create({
        data: { planId: plan.id, name: 'Concept C2', difficulty: 2, masteryScore: 0 },
      });
      await prisma.reviewQueueItem.create({
        data: {
          planId: plan.id,
          conceptId: concept1.id,
          priority: 1,
          reason: 'manual',
          scheduledFor: new Date(),
        },
      });

      // Thực hiện đăng nhập qua UI
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Đăng nhập' }).click();

      await expect(page).toHaveURL(/.*\/dashboard/);

      // Vào màn hình Focus
      await page.goto('/focus');

      // Chờ màn hình hiển thị concept C1 và nút bắt đầu.
      await expect(page.getByRole('heading', { name: 'Concept C1' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu' })).toBeVisible();
    } finally {
      await prisma.user.delete({ where: { id: userA.id } });
    }
  });
});
