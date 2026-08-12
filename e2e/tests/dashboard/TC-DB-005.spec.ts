import { expect, test } from '@playwright/test';
import {
  createTestPrismaClient,
  loginViaUi,
  seedStudentWithoutPlan,
} from '../focus-session/focus-session-test-utils';

const prisma = createTestPrismaClient();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface QueueConceptSeed {
  name: string;
  masteryScore: number | null;
  planId: string;
}

interface TodayQueueEnvelope {
  success: boolean;
  data: {
    items: Array<{
      conceptId: string;
      name: string;
      planId: string;
      priority: number;
      reason: string;
      reasonText: string;
    }>;
  };
}

function calculateExpectedPriority(masteryScore: number | null, remainingDays: number): number {
  return Math.round((1 / remainingDays) * (1 - (masteryScore ?? 0)) * 100) / 100;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-DB-005: Xếp hạng và mở khái niệm “Cần ôn hôm nay”', () => {
  test('Top K theo priority thật, có lý do và truyền đúng plan/concept vào hai điểm vào học', async ({
    page,
  }) => {
    const student = await seedStudentWithoutPlan(prisma, 'tc_db_005', 'Student Queue');

    try {
      // 1. Seed hai plan và sáu item đến hạn thật với priority không trùng nhau.
      const p1Deadline = new Date(Date.now() + 2 * MS_PER_DAY + 60 * 60 * 1000);
      const p2Deadline = new Date(Date.now() + MS_PER_DAY + 60 * 60 * 1000);
      const [p1, p2] = await Promise.all([
        prisma.studyPlan.create({
          data: { userId: student.id, name: 'Plan P1', status: 'active', deadline: p1Deadline },
          select: { id: true },
        }),
        prisma.studyPlan.create({
          data: { userId: student.id, name: 'Plan P2', status: 'active', deadline: p2Deadline },
          select: { id: true },
        }),
      ]);
      const definitions: QueueConceptSeed[] = [
        { name: 'Concept C1', masteryScore: 0.2, planId: p1.id },
        { name: 'Concept C2', masteryScore: 0.6, planId: p1.id },
        { name: 'Concept C3 Untested', masteryScore: null, planId: p1.id },
        { name: 'Concept C4', masteryScore: 0.1, planId: p2.id },
        { name: 'Concept C5', masteryScore: 0.45, planId: p2.id },
        { name: 'Concept C6', masteryScore: 0.9, planId: p2.id },
      ];
      const concepts = await Promise.all(
        definitions.map((definition) =>
          prisma.concept.create({
            data: {
              planId: definition.planId,
              name: definition.name,
              masteryScore: definition.masteryScore,
            },
            select: { id: true, name: true },
          })
        )
      );
      const queueRows = concepts.map((concept, index) => {
        const definition = definitions[index];
        if (!definition) {
          throw new Error('Seed TC-DB-005 thiếu định nghĩa concept.');
        }
        return {
          planId: definition.planId,
          conceptId: concept.id,
          reason: 'manual' as const,
          priority: 0,
          scheduledFor: new Date(Date.now() - 5 * 60 * 1000),
        };
      });
      await prisma.reviewQueueItem.createMany({ data: queueRows });
      const conceptC4 = concepts.find((concept) => concept.name === 'Concept C4');
      if (!conceptC4) {
        throw new Error('Seed TC-DB-005 thiếu Concept C4.');
      }

      // 2. Chờ request thật của Dashboard và đối chiếu top 5 API với công thức priority.
      const todayResponsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/v1/review-queue/today' &&
          response.request().method() === 'GET' &&
          response.status() === 200
      );
      await loginViaUi(page, student.email);
      const todayResponse = await todayResponsePromise;
      const today = (await todayResponse.json()) as TodayQueueEnvelope;
      const expectedNames = [
        'Concept C4',
        'Concept C5',
        'Concept C3 Untested',
        'Concept C1',
        'Concept C2',
      ];
      const expectedPriorities = [
        calculateExpectedPriority(0.1, 1),
        calculateExpectedPriority(0.45, 1),
        calculateExpectedPriority(null, 2),
        calculateExpectedPriority(0.2, 2),
        calculateExpectedPriority(0.6, 2),
      ];
      expect(today.success).toBe(true);
      expect(today.data.items.map((item) => item.name)).toEqual(expectedNames);
      expect(today.data.items.map((item) => item.priority)).toEqual(expectedPriorities);
      expect(today.data.items.every((item) => Number.isFinite(item.priority))).toBe(true);
      expect(today.data.items.every((item) => item.reason === 'manual')).toBe(true);
      expect(today.data.items.every((item) => item.reasonText.length > 0)).toBe(true);
      expect(today.data.items.some((item) => item.name === 'Concept C6')).toBe(false);

      // 3. UI phải giữ đúng thứ tự top K và không thêm item thứ sáu ngoài API response.
      const todaySection = page
        .getByText('Gợi ý hôm nay', { exact: true })
        .locator('xpath=ancestor::section[1]');
      const queueItems = todaySection.getByRole('listitem');
      await expect(queueItems).toHaveCount(5);
      for (const [index, name] of expectedNames.entries()) {
        await expect(queueItems.nth(index)).toContainText(name);
      }
      await expect(todaySection).not.toContainText('Concept C6');
      await expect(todaySection).toContainText('Được thêm vào hàng đợi thủ công');

      // 4. Trước khi Student chọn hình thức học, Dashboard không tự tạo phiên nào.
      expect(await prisma.focusSession.count({ where: { userId: student.id } })).toBe(0);
      expect(await prisma.interviewSession.count({ where: { userId: student.id } })).toBe(0);

      // 5. Hai CTA của item ưu tiên cao nhất phải mang đúng planId/conceptId; Focus chỉ điều hướng.
      const focusLink = todaySection.getByRole('link', {
        name: 'Bắt đầu Focus Session',
        exact: true,
      });
      const interviewLink = todaySection.getByRole('link', {
        name: 'Vào thẳng phiên kiểm tra',
        exact: true,
      });
      await expect(focusLink).toHaveAttribute(
        'href',
        `/focus?planId=${p2.id}&conceptId=${conceptC4.id}`
      );
      await expect(interviewLink).toHaveAttribute(
        'href',
        `/interview?planId=${p2.id}&conceptIds=${conceptC4.id}`
      );
      await focusLink.click();
      await expect(page).toHaveURL(`/focus?planId=${p2.id}&conceptId=${conceptC4.id}`);
      expect(await prisma.focusSession.count({ where: { userId: student.id } })).toBe(0);
    } finally {
      // 6. Dọn toàn bộ seed bằng cascade theo Student.
      await prisma.user.delete({ where: { id: student.id } });
    }
  });
});
