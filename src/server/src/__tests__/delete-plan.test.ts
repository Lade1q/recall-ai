import { deletePlan } from '../services/plan.service';
import prisma from '../config/prisma';
import { createStorageService } from '../services/storage.service';
import { AppError } from '../middleware/errorHandler';

// Mock Prisma client. The factory runs at hoist-time so it cannot reference
// outer `const` variables — everything the mock needs is created inside.
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn(), delete: jest.fn() },
    analysisJob: { deleteMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, default: client };
});

// Mock the storage service. createStorageService() returns a stable singleton so
// the instance captured at plan.service module-load is the same object we assert on.
jest.mock('../services/storage.service', () => {
  const service = {
    delete: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue(''),
  };
  return { __esModule: true, createStorageService: () => service };
});

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const storage = createStorageService() as jest.Mocked<ReturnType<typeof createStorageService>>;

const OWNER_ID = 'user-owner-uuid';
const OTHER_ID = 'user-other-uuid';
const PLAN_ID = 'plan-uuid';
const FILE_KEY_A = 'plans/plan-uuid/1234567890.pdf';
const FILE_KEY_B = 'plans/plan-uuid/1234567891.pdf';

describe('deletePlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks wipes call data but not implementations; re-assert the happy defaults.
    (mockedPrisma.$transaction as jest.Mock).mockResolvedValue(undefined);
    (storage.delete as jest.Mock).mockResolvedValue(undefined);
  });

  // --- Test 1: Plan không tồn tại ---
  it('throws 404 NOT_FOUND when plan does not exist', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(null);

    const error = await deletePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  // --- Test 2: Plan thuộc user khác ---
  it('throws 403 FORBIDDEN when user does not own the plan', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [{ fileKey: FILE_KEY_A }],
    });

    const error = await deletePlan(PLAN_ID, OTHER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  // --- Test 3: Happy path — cascade delete + storage cleanup ---
  it('deletes the plan and cleans up every document file when the owner deletes', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [{ fileKey: FILE_KEY_A }, { fileKey: FILE_KEY_B }],
    });

    await expect(deletePlan(PLAN_ID, OWNER_ID)).resolves.toBeUndefined();

    // AnalysisJob has no FK to StudyPlan → must be deleted manually, inside the txn.
    expect(mockedPrisma.analysisJob.deleteMany).toHaveBeenCalledWith({
      where: { planDraftId: PLAN_ID },
    });
    expect(mockedPrisma.studyPlan.delete).toHaveBeenCalledWith({ where: { id: PLAN_ID } });
    // Both operations are batched into a single atomic transaction.
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect((mockedPrisma.$transaction as jest.Mock).mock.calls[0][0]).toHaveLength(2);

    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledWith(FILE_KEY_A);
    expect(storage.delete).toHaveBeenCalledWith(FILE_KEY_B);
  });

  // --- Test 4: File keys thu thập TRƯỚC khi xóa DB ---
  it('collects file keys before deleting DB records', async () => {
    const callOrder: string[] = [];
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [{ fileKey: FILE_KEY_A }],
    });
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(async () => {
      callOrder.push('transaction');
    });
    (storage.delete as jest.Mock).mockImplementation(async () => {
      callOrder.push('storage');
    });

    await deletePlan(PLAN_ID, OWNER_ID);

    // DB delete must happen before storage cleanup (DB is source of truth).
    expect(callOrder).toEqual(['transaction', 'storage']);
  });

  // --- Test 5: Storage lỗi là best-effort — không làm fail request ---
  it('does not throw when storage cleanup fails (best-effort)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [{ fileKey: FILE_KEY_A }, { fileKey: FILE_KEY_B }],
    });
    (storage.delete as jest.Mock)
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce(undefined);

    await expect(deletePlan(PLAN_ID, OWNER_ID)).resolves.toBeUndefined();

    // The DB delete still committed and the failure was logged, not thrown.
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to cleanup 1/2'));
    warnSpy.mockRestore();
  });

  // --- Test 6: Plan không có document nào → không gọi storage ---
  it('skips storage cleanup when the plan has no documents', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [],
    });

    await expect(deletePlan(PLAN_ID, OWNER_ID)).resolves.toBeUndefined();
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  // --- Test 7: Concurrent delete (P2025) → idempotent 404 ---
  it('maps Prisma P2025 (already deleted) to a 404 for idempotency', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [{ fileKey: FILE_KEY_A }],
    });
    (mockedPrisma.$transaction as jest.Mock).mockRejectedValue({ code: 'P2025' });

    const error = await deletePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    // Storage cleanup must not run when the delete never committed.
    expect(storage.delete).not.toHaveBeenCalled();
  });

  // --- Test 8: Lỗi DB khác P2025 được ném nguyên trạng ---
  it('re-throws non-P2025 transaction errors unchanged', async () => {
    const dbError = Object.assign(new Error('connection reset'), { code: 'P1001' });
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [{ fileKey: FILE_KEY_A }],
    });
    (mockedPrisma.$transaction as jest.Mock).mockRejectedValue(dbError);

    const error = await deletePlan(PLAN_ID, OWNER_ID).catch((e) => e);
    expect(error).toBe(dbError);
    expect(error).not.toBeInstanceOf(AppError);
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
