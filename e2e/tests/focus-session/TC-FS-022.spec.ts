import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  readAccessToken,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();
const studentAConceptName = 'Student A Secret Concept';
const studentBConceptName = 'Student B Own Concept';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

interface FocusHistoryItem {
  id: string;
  planId: string | null;
  concepts: Array<{ id: string; name: string }>;
  status: string;
  focusedSeconds: number;
}

interface FocusOwnershipDataset {
  studentA: FocusPlanSeed;
  studentB: FocusPlanSeed;
  sessionA: { id: string };
  sessionB: { id: string };
}

/** Seed S1 running của A và một S2 completed của B làm positive control cho history của B. */
async function seedOwnershipDataset(): Promise<FocusOwnershipDataset> {
  const studentA = await seedFocusPlan(prisma, 'tc_fs_022_a');
  let studentB: FocusPlanSeed | null = null;

  try {
    studentB = await seedFocusPlan(prisma, 'tc_fs_022_b');
    const conceptA = studentA.concepts[0];
    const conceptB = studentB.concepts[0];
    if (!conceptA || !conceptB) throw new Error('Security seed is missing C1 for A or B.');

    await Promise.all([
      prisma.concept.update({
        where: { id: conceptA.id },
        data: { name: studentAConceptName },
      }),
      prisma.concept.update({
        where: { id: conceptB.id },
        data: { name: studentBConceptName },
      }),
    ]);

    const now = Date.now();
    const [sessionA, sessionB] = await Promise.all([
      prisma.focusSession.create({
        data: {
          userId: studentA.user.id,
          planId: studentA.plan.id,
          conceptIds: [conceptA.id],
          status: 'running',
          strictMode: true,
          startedAt: new Date(now - 2 * 60 * 1_000),
        },
        select: { id: true },
      }),
      prisma.focusSession.create({
        data: {
          userId: studentB.user.id,
          planId: studentB.plan.id,
          conceptIds: [conceptB.id],
          status: 'completed',
          durationMinutes: 10,
          focusedSeconds: 600,
          pomodorosCompleted: 1,
          startedAt: new Date(now - 10 * 60 * 1_000),
          endedAt: new Date(now),
        },
        select: { id: true },
      }),
    ]);

    return { studentA, studentB, sessionA, sessionB };
  } catch (error) {
    if (studentB) await prisma.user.delete({ where: { id: studentB.user.id } });
    await prisma.user.delete({ where: { id: studentA.user.id } });
    throw error;
  }
}

/** Chụp toàn bộ scalar persistence của S1 để phát hiện bất kỳ mutation trái quyền nào. */
async function readSessionAState(sessionId: string) {
  return prisma.focusSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      planId: true,
      conceptIds: true,
      status: true,
      durationMinutes: true,
      focusedSeconds: true,
      awayCount: true,
      pomodorosCompleted: true,
      strictMode: true,
      startedAt: true,
      endedAt: true,
    },
  });
}

async function cleanupOwnershipDataset(dataset: FocusOwnershipDataset): Promise<void> {
  await prisma.user.deleteMany({
    where: { id: { in: [dataset.studentA.user.id, dataset.studentB.user.id] } },
  });
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-022: Cô lập dữ liệu Focus Session giữa hai Student', () => {
  test('Student B không PATCH được S1 và history của B không chứa dữ liệu Student A', async ({
    page,
    request,
  }) => {
    const dataset = await seedOwnershipDataset();

    try {
      const conceptA = dataset.studentA.concepts[0];
      const conceptB = dataset.studentB.concepts[0];
      if (!conceptA || !conceptB) throw new Error('Security seed is missing A/B concepts.');
      const sessionAStateBefore = await readSessionAState(dataset.sessionA.id);

      // 1. Đăng nhập B thật và dùng token đó cho cả PATCH trái quyền lẫn GET history của chính B.
      await loginViaUi(page, dataset.studentB.user.email);
      const tokenB = await readAccessToken(page);
      const authorizationB = { Authorization: `Bearer ${tokenB}` };

      // 2. Payload completion hợp lệ cho S1 running, nhưng B phải nhận 404 để không lộ ownership.
      const patchResponse = await request.patch(
        `${API_BASE_URL}/api/v1/focus-sessions/${dataset.sessionA.id}`,
        {
          headers: authorizationB,
          data: {
            status: 'completed',
            focusedSeconds: 60,
            awayCount: 0,
            pomodorosCompleted: 0,
          },
        }
      );
      expect(patchResponse.status()).toBe(404);
      const rawPatchBody = await patchResponse.text();
      const patchBody = JSON.parse(rawPatchBody) as ApiErrorEnvelope;
      expect(patchBody).toMatchObject({
        success: false,
        error: { code: 'NOT_FOUND' },
      });
      for (const secret of [
        dataset.sessionA.id,
        dataset.studentA.user.id,
        dataset.studentA.plan.id,
        conceptA.id,
        studentAConceptName,
      ]) {
        expect(rawPatchBody).not.toContain(secret);
      }

      // 3. GET history là positive control của token B: trả S2/C2 của B nhưng tuyệt đối không có A.
      const historyResponse = await request.get(`${API_BASE_URL}/api/v1/focus-sessions`, {
        headers: authorizationB,
        params: { limit: 50, offset: 0 },
      });
      expect(historyResponse.status()).toBe(200);
      const rawHistoryBody = await historyResponse.text();
      const historyBody = JSON.parse(rawHistoryBody) as ApiEnvelope<FocusHistoryItem[]>;
      expect(historyBody.success).toBe(true);
      expect(historyBody.data).toHaveLength(1);
      expect(historyBody.data[0]).toEqual(
        expect.objectContaining({
          id: dataset.sessionB.id,
          planId: dataset.studentB.plan.id,
          concepts: [{ id: conceptB.id, name: studentBConceptName }],
          status: 'completed',
          focusedSeconds: 600,
        })
      );
      for (const secret of [
        dataset.sessionA.id,
        dataset.studentA.user.id,
        dataset.studentA.plan.id,
        conceptA.id,
        studentAConceptName,
      ]) {
        expect(rawHistoryBody).not.toContain(secret);
      }

      // 4. Cả PATCH thất bại và GET history của B không được thay đổi bất kỳ field nào của S1.
      expect(await readSessionAState(dataset.sessionA.id)).toEqual(sessionAStateBefore);
    } finally {
      // 5. Cascade cleanup đúng hai owner và toàn bộ session/plan/concept con.
      await cleanupOwnershipDataset(dataset);
    }
  });
});
