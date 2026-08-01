import { retryPlanAnalysis } from '../services/plan.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

// Mock Prisma client — includes $transaction to support SELECT FOR UPDATE serialization.
// The factory runs at hoist-time so we cannot reference outer `const` variables.
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn() },
    analysisJob: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  // $transaction executes the callback with the same mock client,
  // mirroring Prisma's interactive transaction API.
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

const basePlan = {
  id: PLAN_ID,
  userId: OWNER_ID,
  name: 'Kế hoạch ôn thi Giải tích',
  deadline: new Date('2026-08-30'),
  status: 'draft' as const,
};

describe('retryPlanAnalysis', () => {
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

    const error = await retryPlanAnalysis(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  // --- Test 2: Plan thuộc user khác ---
  it('throws 403 FORBIDDEN when user does not own the plan', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);

    const error = await retryPlanAnalysis(PLAN_ID, OTHER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  // --- Test 3: Latest job đang processing (mới tạo, chưa stale) ---
  it('throws 409 RETRY_NOT_ALLOWED when latest job is processing', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'processing',
      fileKey: FILE_KEY,
      createdAt: new Date(),
    });

    const error = await retryPlanAnalysis(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'RETRY_NOT_ALLOWED',
      message: 'An analysis is already in progress',
    });
    expect(mockedPrisma.analysisJob.update).not.toHaveBeenCalled();
  });

  // --- Test 4: Latest job đang pending (mới tạo, chưa stale) ---
  it('throws 409 RETRY_NOT_ALLOWED when latest job is pending', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'pending',
      fileKey: FILE_KEY,
      createdAt: new Date(),
    });

    const error = await retryPlanAnalysis(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'RETRY_NOT_ALLOWED',
      message: 'An analysis is already in progress',
    });
    expect(mockedPrisma.analysisJob.update).not.toHaveBeenCalled();
  });

  // --- Test 3b/4b: Latest job pending/processing nhưng đã stale (Issue #178) ---
  it('allows retry when latest job is stuck processing past the staleness threshold', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    const staleCreatedAt = new Date(Date.now() - 11 * 60 * 1000); // 11 min ago > 10 min threshold
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'stuck-job-uuid',
      status: 'processing',
      fileKey: FILE_KEY,
      createdAt: staleCreatedAt,
    });
    (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({});

    const result = await retryPlanAnalysis(PLAN_ID, OWNER_ID);

    expect(mockedPrisma.analysisJob.update).toHaveBeenCalledWith({
      where: { id: 'stuck-job-uuid' },
      data: { status: 'failed', completedAt: expect.any(Date) },
    });
    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: { planDraftId: PLAN_ID, fileKey: FILE_KEY, status: 'pending' },
    });
    expect(result).toEqual({
      id: PLAN_ID,
      name: basePlan.name,
      deadline: basePlan.deadline,
      status: 'draft',
      analysisStatus: 'pending',
    });
  });

  it('allows retry when latest job is stuck pending past the staleness threshold', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    const staleCreatedAt = new Date(Date.now() - 15 * 60 * 1000); // 15 min ago
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'stuck-job-uuid',
      status: 'pending',
      fileKey: FILE_KEY,
      createdAt: staleCreatedAt,
    });
    (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({});

    const result = await retryPlanAnalysis(PLAN_ID, OWNER_ID);

    expect(mockedPrisma.analysisJob.update).toHaveBeenCalledWith({
      where: { id: 'stuck-job-uuid' },
      data: { status: 'failed', completedAt: expect.any(Date) },
    });
    expect(result.analysisStatus).toBe('pending');
  });

  // --- Test 5: Happy path — latest job failed ---
  it('creates a new AnalysisJob and returns plan info when latest job is failed', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'failed',
      fileKey: FILE_KEY,
    });
    (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({
      id: 'new-job-uuid',
      planDraftId: PLAN_ID,
      fileKey: FILE_KEY,
      status: 'pending',
    });

    const result = await retryPlanAnalysis(PLAN_ID, OWNER_ID);

    expect(result).toEqual({
      id: PLAN_ID,
      name: basePlan.name,
      deadline: basePlan.deadline,
      status: 'draft',
      analysisStatus: 'pending',
    });
  });

  // --- Test 6: Không có AnalysisJob nào ---
  it('throws 409 RETRY_NOT_ALLOWED when no AnalysisJob exists', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue(null);

    const error = await retryPlanAnalysis(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'RETRY_NOT_ALLOWED',
    });
  });

  // --- Test 7: Plan có nhiều jobs — retry dựa trên job mới nhất ---
  it('queries the latest job by createdAt desc', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    // Simulate: findFirst with orderBy returns the latest (failed) job,
    // not the older (done) job — verifying the query shape is correct.
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'failed',
      fileKey: FILE_KEY,
    });
    (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({});

    await retryPlanAnalysis(PLAN_ID, OWNER_ID);

    expect(mockedPrisma.analysisJob.findFirst).toHaveBeenCalledWith({
      where: { planDraftId: PLAN_ID },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, fileKey: true, createdAt: true },
    });
  });

  // --- Test 8: Verify fileKey copy ---
  it('creates a new job with the same fileKey as the failed job', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'failed',
      fileKey: FILE_KEY,
    });
    (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({});

    await retryPlanAnalysis(PLAN_ID, OWNER_ID);

    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fileKey: FILE_KEY }),
    });
  });

  // --- Test 9: Verify status pending ---
  it('creates a new job with status pending', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'failed',
      fileKey: FILE_KEY,
    });
    (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({});

    await retryPlanAnalysis(PLAN_ID, OWNER_ID);

    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planDraftId: PLAN_ID,
        fileKey: FILE_KEY,
        status: 'pending',
      }),
    });
  });

  // --- Test 10: Plan active bị reject ---
  it('throws 409 RETRY_NOT_ALLOWED when plan status is active', async () => {
    const activePlan = { ...basePlan, status: 'active' as const };
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(activePlan);

    const error = await retryPlanAnalysis(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'RETRY_NOT_ALLOWED',
      message: 'Retry is only allowed for draft plans',
    });
  });

  // --- Test 11: fileKey null bị reject ---
  it('throws 409 RETRY_NOT_ALLOWED when fileKey is null', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'failed',
      fileKey: null,
    });

    const error = await retryPlanAnalysis(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'RETRY_NOT_ALLOWED',
      message: 'Original file key is missing, cannot retry',
    });
  });
});
