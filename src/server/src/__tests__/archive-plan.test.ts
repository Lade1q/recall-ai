import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { updatePlanStatusController } from '../controllers/plan.controller';
import { updatePlanStatus } from '../services/plan.service';
import { updatePlanStatusSchema } from '../schemas/plan.schema';
import { AppError } from '../middleware/errorHandler';

// Factory mocks (no real module load) keep this a pure unit test — no Prisma/Gemini
// client is constructed, so it passes without DATABASE_URL/GEMINI_API_KEY (SDP risk R05).
jest.mock('../services/plan.service', () => ({
  __esModule: true,
  createPlanInDb: jest.fn(),
  getUserPlans: jest.fn(),
  getPlanById: jest.fn(),
  retryPlanAnalysis: jest.fn(),
  updatePlanStatus: jest.fn(),
  deletePlan: jest.fn(),
}));

// plan.controller pulls in analysis.service, which constructs a Gemini client at module
// load. Archiving never touches it, so stub the module out rather than build the client.
jest.mock('../services/analysis.service', () => ({
  __esModule: true,
  triggerAnalysis: jest.fn(),
}));

const mockedUpdate = updatePlanStatus as jest.Mock;

const USER_ID = 'user-owner-uuid';
const PLAN_ID = '11111111-1111-4111-8111-111111111111';

const archivedPlan = {
  id: PLAN_ID,
  name: 'Cấu trúc dữ liệu & Giải thuật',
  deadline: new Date('2026-08-30'),
  status: 'archived' as const,
  updatedAt: new Date('2026-07-31T09:00:00.000Z'),
};

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('updatePlanStatusSchema', () => {
  it('accepts the two statuses a user may set', () => {
    expect(updatePlanStatusSchema.parse({ status: 'archived' })).toEqual({ status: 'archived' });
    expect(updatePlanStatusSchema.parse({ status: 'active' })).toEqual({ status: 'active' });
  });

  it('rejects draft — only the analysis pipeline may set it', () => {
    expect(() => updatePlanStatusSchema.parse({ status: 'draft' })).toThrow(ZodError);
  });

  it('rejects a missing or unknown status', () => {
    expect(() => updatePlanStatusSchema.parse({})).toThrow(ZodError);
    expect(() => updatePlanStatusSchema.parse({ status: 'deleted' })).toThrow(ZodError);
  });
});

describe('updatePlanStatusController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Test 1: chưa xác thực ---
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { params: { id: PLAN_ID }, body: { status: 'archived' } } as unknown as Request;
    const res = mockRes();

    const error = await updatePlanStatusController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // --- Test 2: thiếu :id ---
  it('throws ZodError (400 VALIDATION_ERROR) when the plan id param is missing', async () => {
    const req = { userId: USER_ID, params: {}, body: { status: 'archived' } } as unknown as Request;
    const res = mockRes();

    const error = await updatePlanStatusController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // --- Test 2b: id không đúng định dạng UUID (PR #160) ---
  it('throws ZodError (400 VALIDATION_ERROR) when the plan id is not a valid UUID', async () => {
    const req = {
      userId: USER_ID,
      params: { id: 'not-a-uuid' },
      body: { status: 'archived' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updatePlanStatusController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // --- Test 3: body sai được chặn TRƯỚC khi chạm service ---
  it('rejects an invalid status without calling the service', async () => {
    const req = {
      userId: USER_ID,
      params: { id: PLAN_ID },
      body: { status: 'draft' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updatePlanStatusController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // --- Test 4: happy path lưu trữ ---
  it('returns 200 with the updated plan envelope', async () => {
    mockedUpdate.mockResolvedValue(archivedPlan);
    const req = {
      userId: USER_ID,
      params: { id: PLAN_ID },
      body: { status: 'archived' },
    } as unknown as Request;
    const res = mockRes();

    await updatePlanStatusController(req, res);

    expect(mockedUpdate).toHaveBeenCalledWith(PLAN_ID, USER_ID, 'archived');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { plan: archivedPlan },
    });
  });

  // --- Test 5: bỏ lưu trữ dùng chung endpoint ---
  it('passes active through for restoring an archived plan', async () => {
    mockedUpdate.mockResolvedValue({ ...archivedPlan, status: 'active' });
    const req = {
      userId: USER_ID,
      params: { id: PLAN_ID },
      body: { status: 'active' },
    } as unknown as Request;
    const res = mockRes();

    await updatePlanStatusController(req, res);

    expect(mockedUpdate).toHaveBeenCalledWith(PLAN_ID, USER_ID, 'active');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // --- Test 6: lỗi service propagate (asyncHandler bắt ở tầng route) ---
  it('propagates service errors and does not respond', async () => {
    const conflict = new AppError(
      'A plan that is still being analysed cannot be archived',
      409,
      'STATUS_TRANSITION_NOT_ALLOWED'
    );
    mockedUpdate.mockRejectedValue(conflict);
    const req = {
      userId: USER_ID,
      params: { id: PLAN_ID },
      body: { status: 'archived' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updatePlanStatusController(req, res).catch((e) => e);
    expect(error).toBe(conflict);
    expect(res.status).not.toHaveBeenCalled();
  });
});
