import { expect, test, type Page, type Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import {
  API_BASE_URL,
  createTestPrismaClient,
  loginViaUi,
  removeSeededUpload,
  seedFocusPlan,
  type FocusPlanSeed,
} from './focus-session-test-utils';

const prisma = createTestPrismaClient();

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface CreatedFocusSession {
  id: string;
}

interface StartedInterview {
  created: boolean;
  session: {
    id: string;
  };
}

interface ConceptAssessment {
  masteryScore: number | null;
  lastTestedAt: string | null;
}

async function readConceptAssessment(conceptId: string): Promise<ConceptAssessment> {
  const concept = await prisma.concept.findUniqueOrThrow({
    where: { id: conceptId },
    select: { masteryScore: true, lastTestedAt: true },
  });

  return {
    masteryScore: concept.masteryScore,
    lastTestedAt: concept.lastTestedAt?.toISOString() ?? null,
  };
}

async function seedConceptAssessment(conceptId: string): Promise<ConceptAssessment> {
  await prisma.concept.update({
    where: { id: conceptId },
    data: {
      masteryScore: 0.37,
      lastTestedAt: new Date('2026-07-01T03:00:00.000Z'),
    },
  });
  return readConceptAssessment(conceptId);
}

/** Gắn tài liệu text thật và cache dự phòng để backend luôn nạp được câu hỏi cho C1. */
async function attachInterviewMaterial(seed: FocusPlanSeed): Promise<string> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

  const fileKey = `e2e-focus-handoff-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const uploadDirectory = path.join(__dirname, '../../../src/server/uploads');
  const uploadedPath = path.join(uploadDirectory, fileKey);
  const material =
    'Concept C1 là khái niệm nền tảng dùng để kiểm tra việc bàn giao từ Focus Session sang AI Examiner.';

  await fs.promises.mkdir(uploadDirectory, { recursive: true });
  await fs.promises.writeFile(uploadedPath, material, 'utf-8');

  try {
    const document = await prisma.document.create({
      data: {
        planId: seed.plan.id,
        filename: 'focus-handoff.txt',
        fileKey,
        kind: 'text',
        byteSize: Buffer.byteLength(material),
      },
      select: { id: true },
    });
    const source = await prisma.conceptSourceRef.create({
      data: {
        conceptId: conceptC1.id,
        documentId: document.id,
        excerpt: material,
      },
      select: { createdAt: true },
    });

    // Gemini lỗi vẫn phải đi qua fallback thật; cache này không giả response HTTP thành công.
    await prisma.questionCache.create({
      data: {
        conceptId: conceptC1.id,
        questionText: 'Hãy giải thích ngắn gọn Concept C1 là gì.',
        questionType: 'recall',
        answerHint: 'Nêu vai trò nền tảng của Concept C1.',
        generatedAt: new Date(source.createdAt.getTime() + 1_000),
      },
    });

    return fileKey;
  } catch (error) {
    await fs.promises.unlink(uploadedPath).catch(() => undefined);
    throw error;
  }
}

/** Hoàn tất một phiên C1 bằng UI thật và dừng ở màn tổng kết. */
async function completeFocusSession(page: Page, seed: FocusPlanSeed): Promise<string> {
  const conceptC1 = seed.concepts[0];
  if (!conceptC1) throw new Error('Seed data is missing Concept C1.');

  await page.goto(`/focus?planId=${seed.plan.id}&conceptId=${conceptC1.id}`);
  await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible();

  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url() === `${API_BASE_URL}/api/v1/focus-sessions`
  );
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click();
  const startResponse = await startResponsePromise;
  expect(startResponse.status()).toBe(201);
  const startedBody = (await startResponse.json()) as ApiEnvelope<CreatedFocusSession>;
  const sessionId = startedBody.data.id;

  await expect(page.getByRole('timer')).toBeVisible();
  await prisma.focusSession.update({
    where: { id: sessionId },
    data: { startedAt: new Date(Date.now() - 2 * 60 * 1_000) },
  });
  await page.clock.runFor(2_000);

  const endResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url() === `${API_BASE_URL}/api/v1/focus-sessions/${sessionId}`
  );
  await page.getByRole('button', { name: 'Kết thúc phiên học', exact: true }).click();
  expect((await endResponsePromise).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Xong phiên học', exact: true })).toBeVisible();

  expect(
    await prisma.focusSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { userId: true, planId: true, conceptIds: true, status: true },
    })
  ).toEqual({
    userId: seed.user.id,
    planId: seed.plan.id,
    conceptIds: [conceptC1.id],
    status: 'completed',
  });

  return sessionId;
}

test.beforeAll(async () => {
  await prisma.$connect();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('TC-FS-026: Điều hướng sau khi hoàn tất phiên học', () => {
  test('a) Bắt đầu kiểm tra mở AI Examiner với context C1, không bắt chọn lại', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seed = await seedFocusPlan(prisma, 'tc_fs_026_interview');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    let fileKey: string | null = null;

    try {
      // 1. Neo dữ liệu đánh giá trước Focus; chuẩn bị material/cache thật cho handoff Interview.
      const assessmentBeforeFocus = await seedConceptAssessment(conceptC1.id);
      fileKey = await attachInterviewMaterial(seed);
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      const focusSessionId = await completeFocusSession(page, seed);

      // 2. Ngay sau completion và trước CTA, Focus tuyệt đối không chấm hoặc đổi mốc kiểm tra C1.
      expect(await readConceptAssessment(conceptC1.id)).toEqual(assessmentBeforeFocus);

      // 3. Bấm CTA trên tổng kết; lấy Interview ID từ response thật và kiểm tra payload handoff.
      const interviewResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url() === `${API_BASE_URL}/api/v1/interviews`,
        { timeout: 90_000 }
      );
      await page.getByRole('link', { name: 'Bắt đầu kiểm tra', exact: true }).click();
      const interviewResponse = await interviewResponsePromise;
      expect(interviewResponse.status()).toBe(201);
      expect(interviewResponse.request().postDataJSON()).toEqual({
        planId: seed.plan.id,
        conceptIds: [conceptC1.id],
      });
      const interviewBody = (await interviewResponse.json()) as ApiEnvelope<StartedInterview>;
      expect(interviewBody.data.created).toBe(true);
      const interviewSessionId = interviewBody.data.session.id;

      // 4. Route phiên mở thẳng C1 và chưa có bước chọn lại concept.
      await page.waitForURL((url) => url.pathname === `/interview/${interviewSessionId}`);
      await expect(page.getByRole('heading', { name: conceptC1.name, exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Dùng gợi ý hôm nay', exact: true })
      ).toHaveCount(0);

      // 5. DB giữ đúng context C1; tạo Interview/chọn câu hỏi chưa phải chấm điểm.
      expect(
        await prisma.interviewSession.findUniqueOrThrow({
          where: { id: interviewSessionId },
          select: {
            userId: true,
            planId: true,
            conceptQueue: true,
          },
        })
      ).toEqual({
        userId: seed.user.id,
        planId: seed.plan.id,
        conceptQueue: [conceptC1.id],
      });
      expect(await readConceptAssessment(conceptC1.id)).toEqual(assessmentBeforeFocus);
      expect(await prisma.focusSession.count({ where: { userId: seed.user.id } })).toBe(1);
      expect(
        await prisma.focusSession.findUniqueOrThrow({
          where: { id: focusSessionId },
          select: { status: true },
        })
      ).toEqual({ status: 'completed' });
    } finally {
      // 6. Dọn file vật lý lẫn toàn bộ dữ liệu DB của Student A.
      if (fileKey) await removeSeededUpload(fileKey);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });

  test('b) Để sau về Dashboard và không tự mở phiên mới', async ({ page }) => {
    const seed = await seedFocusPlan(prisma, 'tc_fs_026_dashboard');
    const conceptC1 = seed.concepts[0];
    if (!conceptC1) throw new Error('Seed data is missing Concept C1.');
    const unexpectedMutations: Request[] = [];
    const captureUnexpectedMutation = (request: Request): void => {
      if (
        request.method() === 'POST' &&
        (request.url() === `${API_BASE_URL}/api/v1/focus-sessions` ||
          request.url() === `${API_BASE_URL}/api/v1/interviews`)
      ) {
        unexpectedMutations.push(request);
      }
    };

    try {
      // 1. Neo dữ liệu đánh giá, đăng nhập và hoàn tất độc lập một Focus Session C1.
      const assessmentBeforeFocus = await seedConceptAssessment(conceptC1.id);
      await page.clock.install();
      await loginViaUi(page, seed.user.email);
      const focusSessionId = await completeFocusSession(page, seed);
      expect(await readConceptAssessment(conceptC1.id)).toEqual(assessmentBeforeFocus);
      expect(await prisma.interviewSession.count({ where: { userId: seed.user.id } })).toBe(0);

      // 2. Chỉ bắt mutation sau khi summary đã ổn định rồi chọn lối hoãn kiểm tra.
      page.on('request', captureUnexpectedMutation);
      await page.getByRole('link', { name: 'Để sau — về Dashboard', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/dashboard' && url.search === '');
      await expect(
        page.getByRole('link', { name: 'Mở kế hoạch Plan P1', exact: true })
      ).toBeVisible();

      // 3. Không có POST trễ và DB vẫn chỉ chứa đúng phiên Focus vừa hoàn tất.
      expect(unexpectedMutations).toHaveLength(0);
      expect(await prisma.interviewSession.count({ where: { userId: seed.user.id } })).toBe(0);
      expect(
        await prisma.focusSession.findMany({
          where: { userId: seed.user.id },
          select: { id: true, conceptIds: true, status: true },
        })
      ).toEqual([{ id: focusSessionId, conceptIds: [conceptC1.id], status: 'completed' }]);
      expect(await readConceptAssessment(conceptC1.id)).toEqual(assessmentBeforeFocus);
    } finally {
      // 4. Luôn tháo listener và cascade cleanup dữ liệu của nhánh Dashboard.
      page.off('request', captureUnexpectedMutation);
      await prisma.user.delete({ where: { id: seed.user.id } });
    }
  });
});
