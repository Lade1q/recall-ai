import { reanalyzePlan } from '../services/plan.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

// Mock Prisma client — includes $transaction to support SELECT FOR UPDATE serialization.
// The factory runs at hoist-time so we cannot reference outer `const` variables.
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn(), update: jest.fn() },
    analysisJob: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    document: { findFirst: jest.fn() },
    questionCache: { deleteMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) =>
    fn(client)
  );
  return { __esModule: true, default: client };
});

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const OWNER_ID = 'user-owner-uuid';
const OTHER_ID = 'user-other-uuid';
const PLAN_ID = 'plan-uuid';
const FILE_KEY = 'plans/plan-uuid/1234567890.pdf';

const activePlan = {
  id: PLAN_ID,
  userId: OWNER_ID,
  name: 'Cấu trúc dữ liệu & Giải thuật',
  deadline: new Date('2026-08-30'),
  status: 'active' as const,
};

/** The default happy-path world: an active plan, a finished job, a stored document. */
function arrangeReanalyzable() {
  (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(activePlan);
  (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({ status: 'done' });
  (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue({ fileKey: FILE_KEY });
  (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({ id: 'job-new' });
}

describe('reanalyzePlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply $transaction mock after clearAllMocks
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );
  });

  // --- Test 1: Plan không tồn tại ---
  it('throws 404 NOT_FOUND when plan does not exist', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(null);

    const error = await reanalyzePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.analysisJob.create).not.toHaveBeenCalled();
  });

  // --- Test 2: Plan thuộc user khác ---
  it('throws 403 FORBIDDEN when user does not own the plan', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(activePlan);

    const error = await reanalyzePlan(PLAN_ID, OTHER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mockedPrisma.analysisJob.create).not.toHaveBeenCalled();
  });

  // --- Test 3: draft thuộc về retry (#106), không phải re-analyze ---
  it('refuses a draft plan — that case belongs to retry', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...activePlan,
      status: 'draft',
    });

    const error = await reanalyzePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 409, code: 'REANALYZE_NOT_ALLOWED' });
    expect(mockedPrisma.analysisJob.create).not.toHaveBeenCalled();
  });

  // --- Test 4: kế hoạch đã lưu trữ thì khôi phục trước ---
  it('refuses an archived plan rather than spending an AI call on retired material', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...activePlan,
      status: 'archived',
    });

    const error = await reanalyzePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 409, code: 'REANALYZE_NOT_ALLOWED' });
    expect(mockedPrisma.analysisJob.create).not.toHaveBeenCalled();
  });

  // --- Test 5: đang có job chạy (mới tạo, chưa stale) — chống hai job cùng ghi đè một đồ thị ---
  it.each(['pending', 'processing'])(
    'throws 409 when a fresh job is already %s',
    async (status) => {
      arrangeReanalyzable();
      (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
        status,
        createdAt: new Date(),
      });

      const error = await reanalyzePlan(PLAN_ID, OWNER_ID).catch((e) => e);
      expect(error).toMatchObject({ statusCode: 409, code: 'REANALYZE_NOT_ALLOWED' });
      expect(mockedPrisma.analysisJob.create).not.toHaveBeenCalled();
      expect(mockedPrisma.analysisJob.update).not.toHaveBeenCalled();
    }
  );

  // --- Test 5b: job pending/processing kẹt quá ngưỡng — cùng cơ chế release với retry (#178) ---
  it.each(['pending', 'processing'])(
    'releases a %s job stuck past the staleness threshold and proceeds',
    async (status) => {
      arrangeReanalyzable();
      const staleCreatedAt = new Date(Date.now() - 11 * 60 * 1000); // 11 min ago > 10 min threshold
      (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
        id: 'stuck-job-uuid',
        status,
        createdAt: staleCreatedAt,
      });

      const result = await reanalyzePlan(PLAN_ID, OWNER_ID);

      expect(mockedPrisma.analysisJob.update).toHaveBeenCalledWith({
        where: { id: 'stuck-job-uuid' },
        data: { status: 'failed', completedAt: expect.any(Date) },
      });
      expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
        data: { planDraftId: PLAN_ID, fileKey: FILE_KEY, status: 'pending' },
      });
      expect(result.analysisStatus).toBe('pending');
    }
  );

  // --- Test 6: một job failed trước đó không chặn re-analyze ---
  it('allows re-analysis after a previous job failed', async () => {
    arrangeReanalyzable();
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({ status: 'failed' });

    const result = await reanalyzePlan(PLAN_ID, OWNER_ID);
    expect(result.analysisStatus).toBe('pending');
    expect(mockedPrisma.analysisJob.create).toHaveBeenCalled();
  });

  // --- Test 7: không có tài liệu nguồn ---
  it('throws 409 when the plan has no document to re-read', async () => {
    arrangeReanalyzable();
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);

    const error = await reanalyzePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 409, code: 'REANALYZE_NOT_ALLOWED' });
    expect(mockedPrisma.analysisJob.create).not.toHaveBeenCalled();
    expect(mockedPrisma.questionCache.deleteMany).not.toHaveBeenCalled();
  });

  // --- Test 8: happy path — job mới dùng lại fileKey, plan hạ về draft chờ xác nhận (#265) ---
  it('queues a pending job on the stored fileKey and drops the plan back to draft', async () => {
    arrangeReanalyzable();

    const result = await reanalyzePlan(PLAN_ID, OWNER_ID);

    // No re-upload: the file comes from the plan's newest Document.
    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: { planDraftId: PLAN_ID, fileKey: FILE_KEY, status: 'pending' },
    });
    // Issue #216: câu hỏi cache cũ từ trước lần reanalyze này phải được xoá, và phải xoá
    // trước khi job mới tồn tại (xem hợp đồng của clearQuestionCacheForPlan).
    expect(mockedPrisma.questionCache.deleteMany).toHaveBeenCalledWith({
      where: { concept: { planId: PLAN_ID } },
    });
    const deleteOrder = (mockedPrisma.questionCache.deleteMany as jest.Mock).mock
      .invocationCallOrder[0]!;
    const createOrder = (mockedPrisma.analysisJob.create as jest.Mock).mock.invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(createOrder);
    // Same confirmation gate as a first analysis (#265) — the merged graph is not trusted
    // live until the user confirms it via PUT /plans/:id/graph {confirm:true}.
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { status: 'draft' },
    });
    expect(result).toEqual({
      id: PLAN_ID,
      name: activePlan.name,
      deadline: activePlan.deadline,
      status: 'draft',
      analysisStatus: 'pending',
    });
  });

  // --- Test 9: hai request đồng thời bị tuần tự hoá bằng row lock ---
  it('takes a row lock before reading the plan', async () => {
    arrangeReanalyzable();

    await reanalyzePlan(PLAN_ID, OWNER_ID);

    expect(mockedPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });
});
