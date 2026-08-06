import { updatePlanStatus, deletePlan } from '../services/plan.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

// Mock Prisma client — same factory pattern as retry-plan.test.ts, so this stays a unit test
// that runs without DATABASE_URL/GEMINI_API_KEY (SDP risk R05).
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    analysisJob: { findFirst: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, default: client };
});

jest.mock('../services/storage.service', () => ({
  __esModule: true,
  createStorageService: () => ({
    delete: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue(''),
  }),
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const OWNER_ID = 'user-owner-uuid';
const PLAN_ID = 'plan-uuid';

const draftPlan = { id: PLAN_ID, userId: OWNER_ID, status: 'draft' as const };

const archivedRow = {
  id: PLAN_ID,
  name: 'Kế hoạch ôn thi Giải tích',
  deadline: new Date('2026-08-30'),
  status: 'archived' as const,
  updatedAt: new Date('2026-08-06T09:00:00.000Z'),
};

/**
 * #265 — what a `draft` plan may and may not become.
 *
 * The point of these cases is that the state machine has exactly one road into `active`
 * (confirming the concept graph) and one road out of an abandoned draft (delete). Archiving
 * a draft looks harmless in isolation, but `archived` → `active` is an allowed restore, so
 * it would be a second, unconfirmed way to activate a plan.
 */
describe('updatePlanStatus refuses a draft in both directions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue(archivedRow);
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(draftPlan);
  });

  it('refuses to archive a draft whose analysis has finished', async () => {
    // The interesting case: nothing is running, the concepts are there, and it is still
    // refused — the missing thing is the user's confirmation, not the AI's work.
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'done',
      createdAt: new Date(),
    });

    const error = await updatePlanStatus(PLAN_ID, OWNER_ID, 'archived').catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'STATUS_TRANSITION_NOT_ALLOWED',
      message: 'An unconfirmed plan cannot be archived — confirm its concept graph, or delete it',
    });
    expect(mockedPrisma.studyPlan.update).not.toHaveBeenCalled();
  });

  it('refuses to archive a draft that is still being analysed', async () => {
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      status: 'processing',
      createdAt: new Date(),
    });

    const error = await updatePlanStatus(PLAN_ID, OWNER_ID, 'archived').catch((e) => e);

    expect(error).toMatchObject({ statusCode: 409, code: 'STATUS_TRANSITION_NOT_ALLOWED' });
    expect(mockedPrisma.studyPlan.update).not.toHaveBeenCalled();
  });

  it('decides on the plan status alone, without asking about the job', async () => {
    // Guard rail against re-introducing the job lookup this guard briefly had: the rule is
    // about confirmation, and job state cannot express it.
    await updatePlanStatus(PLAN_ID, OWNER_ID, 'archived').catch(() => undefined);

    expect(mockedPrisma.analysisJob.findFirst).not.toHaveBeenCalled();
  });

  it('refuses to activate a draft — that is what confirming the graph is for', async () => {
    const error = await updatePlanStatus(PLAN_ID, OWNER_ID, 'active').catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'STATUS_TRANSITION_NOT_ALLOWED',
      message: 'A draft plan becomes active by confirming its concept graph',
    });
    expect(mockedPrisma.studyPlan.update).not.toHaveBeenCalled();
  });
});

describe('the roads that stay open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue(archivedRow);
  });

  it('archives an active plan', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...draftPlan,
      status: 'active',
    });

    const result = await updatePlanStatus(PLAN_ID, OWNER_ID, 'archived');

    expect(result).toEqual(archivedRow);
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'archived' } })
    );
  });

  it('restores an archived plan to active — always a plan that was confirmed once', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...draftPlan,
      status: 'archived',
    });
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({
      ...archivedRow,
      status: 'active',
    });

    const result = await updatePlanStatus(PLAN_ID, OWNER_ID, 'active');

    expect(result.status).toBe('active');
  });

  it('deletes an abandoned draft — the way out that makes refusing archive acceptable', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      userId: OWNER_ID,
      documents: [],
    });

    await expect(deletePlan(PLAN_ID, OWNER_ID)).resolves.toBeUndefined();
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });
});
