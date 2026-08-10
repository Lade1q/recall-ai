import type { Locator, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// E2E dùng database thật của server; root package không cài các dependency này.
require('../../../src/server/node_modules/dotenv').config({
  path: path.join(__dirname, '../../../src/server/.env'),
});

const prismaModule =
  require('../../../src/server/node_modules/@prisma/client') as typeof import('../../../src/server/node_modules/@prisma/client');
const adapterModule =
  require('../../../src/server/node_modules/@prisma/adapter-pg') as typeof import('../../../src/server/node_modules/@prisma/adapter-pg');
const bcrypt =
  require('../../../src/server/node_modules/bcryptjs') as typeof import('../../../src/server/node_modules/bcryptjs');

export const API_BASE_URL = (process.env.E2E_API_BASE_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  ''
);
export const TEST_PASSWORD = 'SecurePassword123';

export type TestPrismaClient = InstanceType<typeof prismaModule.PrismaClient>;

export interface FocusPlanSeed {
  user: {
    id: string;
    email: string;
  };
  plan: {
    id: string;
  };
  concepts: Array<{
    id: string;
    name: string;
  }>;
}

export interface SeededPdfDocument {
  id: string;
  filename: string;
  fileKey: string;
  pageCount: number;
}

/** Seed một Student có mật khẩu E2E chuẩn nhưng chưa tạo plan. */
export async function seedStudentWithoutPlan(
  prisma: TestPrismaClient,
  emailPrefix: string,
  name = 'Student C'
): Promise<FocusPlanSeed['user']> {
  const email = createUniqueEmail(emailPrefix);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true },
  });
}

/** Đọc giá trị đồng hồ `MM:SS` trong một locator thành tổng số giây. */
export async function readClockSeconds(locator: Locator): Promise<number> {
  const text = await locator.textContent();
  const match = text?.match(/(\d{2}):(\d{2})/);
  if (!match) throw new Error(`Không đọc được giá trị MM:SS từ: ${text ?? '<null>'}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Tạo PrismaClient đúng adapter bắt buộc của Prisma 7. */
export function createTestPrismaClient(): TestPrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run focus-session E2E tests.');
  }

  return new prismaModule.PrismaClient({
    adapter: new adapterModule.PrismaPg({ connectionString: databaseUrl }),
  });
}

/** Sinh email duy nhất để các worker Playwright có thể chạy song song an toàn. */
export function createUniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
}

/**
 * Seed một Student, plan active, C1-C3 và các mục đến hạn thật trong review queue.
 * Mốc đến hạn lùi 5 phút để tránh sai lệch mili-giây giữa seed và request của server.
 */
export async function seedFocusPlan(
  prisma: TestPrismaClient,
  emailPrefix: string
): Promise<FocusPlanSeed> {
  const email = createUniqueEmail(emailPrefix);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // Toàn bộ seed phải nguyên tử: lỗi ở plan/concept/queue tự rollback cả User vừa tạo.
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: { email, passwordHash, name: 'Student A' },
      select: { id: true, email: true },
    });
    const plan = await transaction.studyPlan.create({
      data: { userId: user.id, name: 'Plan P1', status: 'active' },
      select: { id: true },
    });
    const concepts = await Promise.all(
      ['Concept C1', 'Concept C2', 'Concept C3'].map((name, index) =>
        transaction.concept.create({
          data: {
            planId: plan.id,
            name,
            difficulty: index + 1,
            masteryScore: 0,
          },
          select: { id: true, name: true },
        })
      )
    );
    const scheduledFor = new Date(Date.now() - 5 * 60 * 1000);
    await transaction.reviewQueueItem.createMany({
      data: concepts.map((concept, index) => ({
        planId: plan.id,
        conceptId: concept.id,
        // Queue sắp priority giảm dần; C1 phải là item đầu để mọi TC dùng seed chung ổn định.
        priority: concepts.length - index,
        reason: 'manual' as const,
        scheduledFor,
      })),
    });

    return { user, plan, concepts };
  });
}

/**
 * Gắn PDF nhiều trang thật vào P1 và neo C1 vào trang đầu để UI có thể tải cả excerpt lẫn file.
 * File được copy vào đúng storage local của server; caller phải gọi `removeSeededUpload` ở finally.
 */
export async function attachMultiPagePdf(
  prisma: TestPrismaClient,
  seed: FocusPlanSeed
): Promise<SeededPdfDocument> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

  const filename = 'search_algorithms.pdf';
  const fileKey = `e2e-focus-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const fixturePath = path.join(__dirname, '../../../docs/test/fixtures/search_algorithms.pdf');
  const uploadDirectory = path.join(__dirname, '../../../src/server/uploads');
  const uploadedPath = path.join(uploadDirectory, fileKey);
  await fs.promises.mkdir(uploadDirectory, { recursive: true });
  await fs.promises.copyFile(fixturePath, uploadedPath);
  const stats = await fs.promises.stat(uploadedPath);

  try {
    const document = await prisma.document.create({
      data: {
        planId: seed.plan.id,
        filename,
        fileKey,
        kind: 'pdf',
        pageCount: 35,
        byteSize: stats.size,
      },
      select: { id: true, filename: true, fileKey: true, pageCount: true },
    });
    await prisma.conceptSourceRef.create({
      data: {
        conceptId: conceptC1.id,
        documentId: document.id,
        pageFrom: 1,
        pageTo: 2,
        excerpt: 'Search algorithms compare candidate positions until the target is found.',
      },
    });

    return { ...document, pageCount: document.pageCount ?? 35 };
  } catch (error) {
    await fs.promises.unlink(uploadedPath).catch(() => undefined);
    throw error;
  }
}

/** Xóa đúng object storage duy nhất do `attachMultiPagePdf` tạo; bỏ qua khi đã được dọn trước. */
export async function removeSeededUpload(fileKey: string): Promise<void> {
  const uploadedPath = path.join(__dirname, '../../../src/server/uploads', fileKey);
  try {
    await fs.promises.unlink(uploadedPath);
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/** Đăng nhập qua giao diện thật và chờ AuthContext hoàn tất điều hướng. */
export async function loginViaUi(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Lấy access token do luồng đăng nhập UI thật lưu để kiểm tra trực tiếp API cùng user. */
export async function readAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (!token) {
    throw new Error('Access token was not stored after UI login.');
  }
  return token;
}
