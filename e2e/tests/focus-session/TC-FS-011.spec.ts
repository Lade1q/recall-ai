import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ReviewSuggestion {
  conceptId: string;
  name: string;
  priority: number;
  reason: string;
  reasonText: string;
}

interface ReviewQueueResponse {
  items: ReviewSuggestion[];
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-011: Xem gợi ý concept từ SRE và chọn để học', () => {
  test('Focus tự lấy gợi ý SRE cao nhất C2, chờ xác nhận và tạo phiên đúng C2', async ({
    page,
    request,
  }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_011');
    const conceptC1 = seed.concepts[0];
    const conceptC2 = seed.concepts[1];
    const conceptC3 = seed.concepts[2];
    if (!conceptC1 || !conceptC2 || !conceptC3) {
      throw new Error('Seed data is missing C1, C2 or C3.');
    }

    try {
      // 1. Seed tín hiệu SRE thật: deadline gần và mastery tạo thứ tự C2 > C3 > C1.
      await prisma.studyPlan.update({
        where: { id: seed.plan.id },
        data: { deadline: new Date(Date.now() + 24 * 60 * 60 * 1_000) },
      });
      await Promise.all([
        prisma.concept.update({ where: { id: conceptC1.id }, data: { masteryScore: 0.95 } }),
        prisma.concept.update({ where: { id: conceptC2.id }, data: { masteryScore: 0 } }),
        prisma.concept.update({ where: { id: conceptC3.id }, data: { masteryScore: 0.5 } }),
        prisma.reviewQueueItem.updateMany({
          where: { conceptId: conceptC2.id },
          data: { reason: 'deadline_priority' },
        }),
        prisma.reviewQueueItem.updateMany({
          where: { conceptId: conceptC3.id },
          data: { reason: 'spaced_repetition' },
        }),
      ]);

      // 2. Đăng nhập và mở Focus; UI phải tự gọi SRE `/today?limit=1` thay vì chờ nút phụ.
      await loginViaUi(page, seed.user.email);
      const accessToken = await readAccessToken(page);
      const topSuggestionPromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/api/v1/review-queue/today' &&
          url.searchParams.get('limit') === '1'
        );
      });
      await page.goto('/focus');
      const topSuggestionResponse = await topSuggestionPromise;
      expect(topSuggestionResponse.status()).toBe(200);
      const topSuggestionBody =
        (await topSuggestionResponse.json()) as ApiEnvelope<ReviewQueueResponse>;
      expect(topSuggestionBody.data.items).toHaveLength(1);
      expect(topSuggestionBody.data.items[0]?.conceptId).toBe(conceptC2.id);

      // 3. Kiểm tra trực tiếp top-2 của SRE là C2/C3 với lý do ưu tiên do server sinh.
      const listResponse = await request.get(`${API_BASE_URL}/api/v1/review-queue/today`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit: 2 },
      });
      expect(listResponse.status()).toBe(200);
      const listBody = (await listResponse.json()) as ApiEnvelope<ReviewQueueResponse>;
      expect(listBody.data.items.map((item) => item.conceptId)).toEqual([
        conceptC2.id,
        conceptC3.id,
      ]);
      expect(listBody.data.items[0]).toEqual(
        expect.objectContaining({
          name: conceptC2.name,
          reason: 'deadline_priority',
          reasonText: 'Deadline sắp tới, cần ưu tiên ôn tập',
        })
      );
      expect(listBody.data.items[1]).toEqual(
        expect.objectContaining({
          name: conceptC3.name,
          reason: 'spaced_repetition',
          reasonText: 'Đã đến lịch ôn tập theo mức độ ghi nhớ',
        })
      );
      expect(listBody.data.items[0]?.priority ?? 0).toBeGreaterThan(
        listBody.data.items[1]?.priority ?? 0
      );

      // 4. UI hiển thị C2/lý do nhưng chưa tự bắt đầu hoặc ép tạo record trước xác nhận.
      await expect(page.getByRole('heading', { name: conceptC2.name, exact: true })).toBeVisible();
      await expect(
        page.getByText('Deadline sắp tới, cần ưu tiên ôn tập', { exact: true })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bắt đầu', exact: true })).toBeVisible();
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(0);

      // 5. Student xác nhận gợi ý bằng Bắt đầu, sau đó pause và kết thúc phiên.
      await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
      await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Xong phiên học', exact: true })
      ).toBeVisible();

      // 6. DB chỉ có một record hoàn tất liên kết đúng C2, không tự thêm C3/C1.
      const sessions = await prisma.focusSession.findMany({
        where: { userId: seed.user.id },
        select: { status: true, conceptIds: true },
      });
      expect(sessions).toEqual([{ status: 'completed', conceptIds: [conceptC2.id] }]);
    } finally {
      // 7. Cascade cleanup Student cùng toàn bộ tín hiệu SRE/session đã seed.
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
