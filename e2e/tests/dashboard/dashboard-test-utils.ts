import {
  createUniqueEmail,
  TEST_PASSWORD,
  type TestPrismaClient,
} from '../focus-session/focus-session-test-utils';

const bcrypt =
  require('../../../src/server/node_modules/bcryptjs') as typeof import('../../../src/server/node_modules/bcryptjs');

type DashboardPlanStatus = 'active' | 'archived' | 'draft';

export interface DashboardSeed {
  user: {
    id: string;
    email: string;
  };
  plans: Array<{
    id: string;
    name: string;
  }>;
}

export interface DashboardSeedOptions {
  hasP1?: boolean;
  hasP2?: boolean;
  p1Deadline?: Date | null;
  p2Deadline?: Date | null;
  p1Status?: DashboardPlanStatus;
  p2Status?: DashboardPlanStatus;
  emptyQueue?: boolean;
  seedActivity?: boolean;
}

/**
 * Seed một Student Dashboard độc lập với P1/P2, graph, hàng đợi đến hạn và hoạt động học.
 * Mọi record đều nằm trong một transaction để lỗi seed không để lại dữ liệu rác cho worker khác.
 */
export async function seedDashboardData(
  prisma: TestPrismaClient,
  emailPrefix: string,
  options: DashboardSeedOptions = {}
): Promise<DashboardSeed> {
  const {
    hasP1 = true,
    hasP2 = false,
    p1Deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    p2Deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    p1Status = 'active',
    p2Status = 'active',
    emptyQueue = false,
    seedActivity = true,
  } = options;
  const email = createUniqueEmail(emailPrefix);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  return prisma.$transaction(async (transaction): Promise<DashboardSeed> => {
    const user = await transaction.user.create({
      data: { email, passwordHash, name: 'Student Dashboard' },
      select: { id: true, email: true },
    });
    const plans: DashboardSeed['plans'] = [];

    if (hasP1) {
      const p1 = await transaction.studyPlan.create({
        data: { userId: user.id, name: 'Plan P1', status: p1Status, deadline: p1Deadline },
        select: { id: true, name: true },
      });
      plans.push(p1);

      // 1. Tạo ba mức mastery để Dashboard có dữ liệu plan, graph và thống kê thật.
      const concepts = await Promise.all(
        ['C1', 'C2', 'C3'].map((name, index) =>
          transaction.concept.create({
            data: {
              planId: p1.id,
              name: `Concept ${name}`,
              difficulty: index + 1,
              masteryScore: index === 0 ? 0.2 : index === 1 ? 0.8 : null,
              lastTestedAt: index === 1 ? new Date() : null,
            },
            select: { id: true, name: true },
          })
        )
      );
      const [conceptC1, conceptC2] = concepts;
      if (!conceptC1 || !conceptC2) {
        throw new Error('Seed Dashboard P1 thiếu concept bắt buộc.');
      }

      // 2. Tạo cạnh C1 → C2 để mini graph có quan hệ thật.
      await transaction.conceptEdge.create({
        data: { planId: p1.id, fromConceptId: conceptC1.id, toConceptId: conceptC2.id },
      });

      // 3. Đặt lịch lùi năm phút để item chắc chắn đã đến hạn tại lúc API đọc dữ liệu.
      if (!emptyQueue) {
        await transaction.reviewQueueItem.create({
          data: {
            planId: p1.id,
            conceptId: conceptC1.id,
            priority: 10,
            reason: 'manual',
            scheduledFor: new Date(Date.now() - 5 * 60 * 1000),
          },
        });
      }

      // 4. Hoạt động thật cung cấp số liệu thống kê/streak khi TC cần Dashboard đầy đủ.
      if (seedActivity) {
        await transaction.focusSession.create({
          data: {
            userId: user.id,
            planId: p1.id,
            conceptIds: [conceptC1.id],
            status: 'completed',
            durationMinutes: 25,
            focusedSeconds: 1500,
            pomodorosCompleted: 1,
            startedAt: new Date(Date.now() - 30 * 60 * 1000),
            endedAt: new Date(Date.now() - 5 * 60 * 1000),
          },
        });
        await transaction.interviewSession.create({
          data: {
            userId: user.id,
            planId: p1.id,
            status: 'completed',
            conceptQueue: [conceptC2.id],
            startedAt: new Date(Date.now() - 60 * 60 * 1000),
            endedAt: new Date(Date.now() - 40 * 60 * 1000),
          },
        });
      }
    }

    if (hasP2) {
      const p2 = await transaction.studyPlan.create({
        data: { userId: user.id, name: 'Plan P2', status: p2Status, deadline: p2Deadline },
        select: { id: true, name: true },
      });
      plans.push(p2);

      const p2Concept = await transaction.concept.create({
        data: { planId: p2.id, name: 'Concept P2C1' },
        select: { id: true },
      });
      if (!emptyQueue) {
        await transaction.reviewQueueItem.create({
          data: {
            planId: p2.id,
            conceptId: p2Concept.id,
            priority: 5,
            reason: 'spaced_repetition',
            scheduledFor: new Date(Date.now() - 5 * 60 * 1000),
          },
        });
      }
    }

    return { user, plans };
  });
}
