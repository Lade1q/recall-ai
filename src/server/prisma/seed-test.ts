import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

/**
 * Script chuẩn bị dữ liệu test cho Postman Collection (Authentication Module).
 *
 * DÙNG CHO:
 *   - Chạy thủ công trước khi test: `npm run test:seed`
 *   - CI/CD pipeline: chạy tự động trước bước "Run Postman Collection"
 *
 * SAU KHI CHẠY, DATABASE SẼ CÓ:
 *   - existing@example.com  (Password: SecurePass1) -> TC-AM-01-02: test email đã tồn tại
 *   - logintest@example.com (Password: SecurePass1) -> TC-AM-02-01 ~ TC-AM-02-10: test login
 *
 * KHÔNG CHẠY TRÊN PRODUCTION.
 */
async function main() {
  // Guard: Không cho phép chạy trên production
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed-test] ABORTED: NOT allowed in production!');
    process.exit(1);
  }

  console.log('[seed-test] Starting test database reset & seed...');
  const password = 'SecurePass1';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    // ── Bước 1: Xóa sạch toàn bộ dữ liệu (thứ tự: child -> parent) ──
    await tx.questionCache.deleteMany();
    await tx.conceptEdge.deleteMany();
    await tx.concept.deleteMany();
    await tx.analysisJob.deleteMany();
    await tx.studyPlan.deleteMany();
    await tx.user.deleteMany();

    console.log('[seed-test] Database cleared.');

    // ── Bước 2: Tạo user phục vụ test Postman ──

    // User 1: Dùng cho TC-AM-01-02 (test register với email đã tồn tại)
    await tx.user.create({
      data: {
        email: 'existing@example.com',
        passwordHash,
        name: 'Existing User',
      },
    });
    console.log(`[seed-test] Created: existing@example.com (password: ${password})`);

    // User 2: Dùng cho TC-AM-02-01 ~ TC-AM-02-10 (login, protected route, refresh token)
    await tx.user.create({
      data: {
        email: 'logintest@example.com',
        passwordHash,
        name: 'Login Test User',
      },
    });
    console.log(`[seed-test] Created: logintest@example.com (password: ${password})`);

    // User 3: Dùng cho test UI / thao tác thông thường
    await tx.user.create({
      data: {
        email: 'user@example.com',
        passwordHash,
        name: 'Normal User',
      },
    });
    console.log(`[seed-test] Created: user@example.com (password: ${password})`);
  });

  console.log('');
  console.log('[seed-test] Done. Database is ready for Postman test run.');
  console.log('[seed-test]    Accounts seeded:');
  console.log('[seed-test]      existing@example.com  / SecurePass1');
  console.log('[seed-test]      logintest@example.com / SecurePass1');
  console.log('[seed-test]      user@example.com      / SecurePass1');
  console.log('');
  console.log('[seed-test]  Now run:  npx postman collection run ...');
}

main()
  .catch((e) => {
    console.error('[seed-test] Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
