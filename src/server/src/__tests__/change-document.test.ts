import { changePlanDocument } from '../services/plan.service';
import prisma from '../config/prisma';
import { createStorageService } from '../services/storage.service';
import { AppError } from '../middleware/errorHandler';

// Mock Prisma client — includes $transaction to support SELECT FOR UPDATE serialization,
// same pattern as retry-plan.test.ts.
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn() },
    analysisJob: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    document: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    questionCache: { deleteMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) =>
    fn(client)
  );
  return { __esModule: true, default: client };
});

// createStorageService() returns a stable singleton so the instance captured at
// plan.service module-load is the same object we assert on (same pattern as delete-plan.test.ts).
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
const OLD_FILE_KEY = 'plans/plan-uuid/1000000000.pdf';

const basePlan = {
  id: PLAN_ID,
  userId: OWNER_ID,
  name: 'Kế hoạch ôn thi Giải tích',
  deadline: new Date('2026-08-30'),
  status: 'draft' as const,
};

const newDocumentMeta = {
  filename: 'CSC10006_Chapter5_v2.pdf',
  fileKey: 'plans/plan-uuid/2000000000.pdf',
  kind: 'pdf' as const,
  pageCount: 76,
  byteSize: 3100000,
};

describe('changePlanDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );
    (storage.delete as jest.Mock).mockResolvedValue(undefined);
  });

  it('throws 404 NOT_FOUND when plan does not exist', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(null);

    const error = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('throws 403 FORBIDDEN when user does not own the plan', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);

    const error = await changePlanDocument(PLAN_ID, OTHER_ID, newDocumentMeta).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('throws 409 DOCUMENT_CHANGE_NOT_ALLOWED when plan is not draft', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...basePlan,
      status: 'active',
    });

    const error = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_CHANGE_NOT_ALLOWED',
      message: 'Changing the document is only allowed for draft plans',
    });
    expect(mockedPrisma.questionCache.deleteMany).not.toHaveBeenCalled();
  });

  it('throws 409 DOCUMENT_CHANGE_NOT_ALLOWED when no AnalysisJob exists', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue(null);

    const error = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_CHANGE_NOT_ALLOWED',
      message: 'No analysis job found for this plan',
    });
  });

  it('throws 409 when latest job is processing and not stale', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-uuid',
      status: 'processing',
      createdAt: new Date(),
    });

    const error = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_CHANGE_NOT_ALLOWED',
      message: 'An analysis is already in progress',
    });
    expect(mockedPrisma.document.update).not.toHaveBeenCalled();
  });

  it('throws 409 when latest job is done (not failed)', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-uuid',
      status: 'done',
      createdAt: new Date(),
    });

    const error = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_CHANGE_NOT_ALLOWED',
      message: 'Plan analysis is not in a failed state',
    });
  });

  it('releases a stale processing job past the threshold and proceeds', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    const staleCreatedAt = new Date(Date.now() - 11 * 60 * 1000); // 11 min ago > 10 min threshold
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'stuck-job-uuid',
      status: 'processing',
      createdAt: staleCreatedAt,
    });
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc-uuid',
      fileKey: OLD_FILE_KEY,
    });

    const result = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta);

    expect(mockedPrisma.analysisJob.update).toHaveBeenCalledWith({
      where: { id: 'stuck-job-uuid' },
      data: { status: 'failed', completedAt: expect.any(Date) },
    });
    expect(result.analysisStatus).toBe('pending');
  });

  it('overwrites the existing Document row and creates a new pending job (happy path)', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'failed-job-uuid',
      status: 'failed',
      createdAt: new Date(),
    });
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc-uuid',
      fileKey: OLD_FILE_KEY,
    });

    const result = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta);

    // Direction (A): overwrite, not insert — processAnalysisJob's anchor query
    // (orderBy createdAt asc) must keep resolving to this same row.
    expect(mockedPrisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-uuid' },
      data: {
        filename: newDocumentMeta.filename,
        fileKey: newDocumentMeta.fileKey,
        kind: newDocumentMeta.kind,
        pageCount: newDocumentMeta.pageCount,
        byteSize: newDocumentMeta.byteSize,
      },
    });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();

    expect(mockedPrisma.questionCache.deleteMany).toHaveBeenCalledWith({
      where: { concept: { planId: PLAN_ID } },
    });

    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: { planDraftId: PLAN_ID, fileKey: newDocumentMeta.fileKey, status: 'pending' },
    });

    // Cache phải được xoá trước khi job mới tồn tại — nếu không, một request khác có thể thấy
    // job mới đã được tạo trong khi pregenerateForPlan vẫn còn thấy cache cũ.
    const deleteOrder = (mockedPrisma.questionCache.deleteMany as jest.Mock).mock
      .invocationCallOrder[0]!;
    const createOrder = (mockedPrisma.analysisJob.create as jest.Mock).mock.invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(createOrder);

    expect(result).toEqual({
      id: PLAN_ID,
      name: basePlan.name,
      deadline: basePlan.deadline,
      status: 'draft',
      analysisStatus: 'pending',
    });

    // The file this Document no longer references gets cleaned up, keyed off the old
    // fileKey — never the new one.
    expect(storage.delete).toHaveBeenCalledWith(OLD_FILE_KEY);
  });

  it('falls back to creating a Document when the plan unexpectedly has none', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'failed-job-uuid',
      status: 'failed',
      createdAt: new Date(),
    });
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);

    await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta);

    expect(mockedPrisma.document.create).toHaveBeenCalledWith({
      data: {
        planId: PLAN_ID,
        filename: newDocumentMeta.filename,
        fileKey: newDocumentMeta.fileKey,
        kind: newDocumentMeta.kind,
        pageCount: newDocumentMeta.pageCount,
        byteSize: newDocumentMeta.byteSize,
      },
    });
    expect(mockedPrisma.document.update).not.toHaveBeenCalled();
    // No old Document, so nothing in storage to clean up.
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('does not fail the request when storage cleanup of the old file errors', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(basePlan);
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'failed-job-uuid',
      status: 'failed',
      createdAt: new Date(),
    });
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc-uuid',
      fileKey: OLD_FILE_KEY,
    });
    (storage.delete as jest.Mock).mockRejectedValue(new Error('disk error'));

    const result = await changePlanDocument(PLAN_ID, OWNER_ID, newDocumentMeta);

    expect(result.analysisStatus).toBe('pending');
  });
});
