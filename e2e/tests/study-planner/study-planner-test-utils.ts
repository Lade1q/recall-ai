import * as fs from 'fs';
import * as path from 'path';
import {
  createTestPrismaClient,
  createUniqueEmail,
  API_BASE_URL,
  readAccessToken,
  seedStudentWithoutPlan,
  TEST_PASSWORD,
  type TestPrismaClient,
} from '../focus-session/focus-session-test-utils';

export {
  API_BASE_URL,
  createTestPrismaClient,
  createUniqueEmail,
  readAccessToken,
  seedStudentWithoutPlan,
  TEST_PASSWORD,
};
export type { TestPrismaClient };

export interface PlannerPlanSeed {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  concepts: Array<{ id: string; name: string }>;
  document?: { id: string; fileKey: string; filename: string };
}

export interface PlannerUserSeed {
  id: string;
  email: string;
}

/** Tạo dữ liệu Study Planner thật, dùng chung cho cả nhánh UI và request của Playwright. */
export async function seedPlannerPlan(
  prisma: TestPrismaClient,
  userId: string,
  options: {
    name: string;
    status: 'draft' | 'active' | 'archived';
    jobStatus?: 'pending' | 'processing' | 'done' | 'failed';
    masteryScores?: Array<number | null>;
    withDocument?: boolean;
    reviewQueue?: boolean;
    traceback?: boolean;
  }
): Promise<PlannerPlanSeed> {
  const plan = await prisma.studyPlan.create({
    data: {
      userId,
      name: options.name,
      status: options.status,
      tracebackEnabled: options.traceback ?? true,
      deadline: new Date(Date.now() + 7 * 86_400_000),
    },
    select: { id: true, name: true, status: true },
  });

  const names = ['Khái niệm nền tảng', 'Khái niệm trung gian', 'Khái niệm ứng dụng'];
  const concepts = await Promise.all(
    names.map((name, index) =>
      prisma.concept.create({
        data: {
          planId: plan.id,
          name: `${name} · ${options.name}`,
          difficulty: index + 1,
          masteryScore: options.masteryScores?.[index] ?? null,
          lastTestedAt:
            options.masteryScores?.[index] == null ? null : new Date(Date.now() - 86_400_000),
        },
        select: { id: true, name: true },
      })
    )
  );
  await prisma.conceptEdge.createMany({
    data: [
      { planId: plan.id, fromConceptId: concepts[0].id, toConceptId: concepts[1].id },
      { planId: plan.id, fromConceptId: concepts[1].id, toConceptId: concepts[2].id },
    ],
  });

  let document: PlannerPlanSeed['document'];
  if (options.withDocument) {
    const filename = `${options.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    const fileKey = `e2e-planner-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    const source = path.join(__dirname, '../../../docs/test/fixtures/search_algorithms.pdf');
    const destination = path.join(__dirname, '../../../src/server/uploads', fileKey);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(source, destination);
    try {
      const stats = await fs.promises.stat(destination);
      const row = await prisma.document.create({
        data: {
          planId: plan.id,
          filename,
          fileKey,
          kind: 'pdf',
          pageCount: 35,
          byteSize: stats.size,
        },
        select: { id: true, fileKey: true, filename: true },
      });
      document = row;
    } catch (error) {
      await fs.promises.unlink(destination).catch(() => undefined);
      throw error;
    }
  }

  if (options.jobStatus) {
    await prisma.analysisJob.create({
      data: {
        planDraftId: plan.id,
        fileKey: document?.fileKey ?? null,
        status: options.jobStatus,
        completedAt: options.jobStatus === 'done' ? new Date(Date.now() - 60_000) : null,
        errorMessage: options.jobStatus === 'failed' ? 'E2E simulated analysis failure' : null,
      },
    });
  }

  if (options.reviewQueue) {
    const scheduledFor = new Date(Date.now() - 5 * 60_000);
    await prisma.reviewQueueItem.createMany({
      data: concepts.map((concept, index) => ({
        planId: plan.id,
        conceptId: concept.id,
        priority: 10 - index,
        reason:
          options.traceback && index === 0
            ? ('traceback' as const)
            : ('spaced_repetition' as const),
        depth: options.traceback && index === 0 ? 1 : null,
        scheduledFor,
      })),
    });
  }

  return { ...plan, concepts, document };
}

export async function cleanupPlannerUser(prisma: TestPrismaClient, userId: string): Promise<void> {
  const plans = await prisma.studyPlan.findMany({ where: { userId }, select: { id: true } });
  const documents = await prisma.document.findMany({
    where: { plan: { userId } },
    select: { fileKey: true },
  });
  // AnalysisJob không có khóa ngoại tới StudyPlan trong luồng draft bất đồng bộ, nên xóa User
  // theo cascade không thể tự dọn các dòng này.
  await prisma.analysisJob.deleteMany({
    where: { planDraftId: { in: plans.map((plan) => plan.id) } },
  });
  await prisma.user.delete({ where: { id: userId } });
  await Promise.all(documents.map(({ fileKey }) => removePlannerUpload(fileKey)));
}

export async function removePlannerUpload(fileKey: string): Promise<void> {
  const filePath = path.join(__dirname, '../../../src/server/uploads', fileKey);
  await fs.promises.unlink(filePath).catch((error: unknown) => {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
  });
}
