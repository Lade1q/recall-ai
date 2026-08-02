import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { retryPlanController } from '../controllers/plan.controller';
import { retryPlanAnalysis } from '../services/plan.service';
import { triggerAnalysis } from '../services/analysis.service';
import { AppError } from '../middleware/errorHandler';

// Factory mocks (no real module load) keep this a pure unit test — no Prisma/Gemini
// client is constructed, so it passes without DATABASE_URL/GEMINI_API_KEY (SDP risk R05).
jest.mock('../services/plan.service', () => ({
  __esModule: true,
  createPlanInDb: jest.fn(),
  getUserPlans: jest.fn(),
  getPlanById: jest.fn(),
  retryPlanAnalysis: jest.fn(),
  deletePlan: jest.fn(),
}));

jest.mock('../services/analysis.service', () => ({
  __esModule: true,
  triggerAnalysis: jest.fn(),
}));

const mockedRetry = retryPlanAnalysis as jest.Mock;
const mockedTrigger = triggerAnalysis as jest.Mock;

const USER_ID = 'user-owner-uuid';
const PLAN_ID = '11111111-1111-4111-8111-111111111111';

const planResponse = {
  id: PLAN_ID,
  name: 'Kế hoạch ôn thi Giải tích',
  deadline: new Date('2026-08-30'),
  status: 'draft' as const,
  analysisStatus: 'pending' as const,
};

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('retryPlanController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrigger.mockResolvedValue(undefined);
  });

  // --- Test 1: chưa xác thực ---
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { params: { id: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    const error = await retryPlanController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedRetry).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // --- Test 2: thiếu :id ---
  it('throws ZodError (400 VALIDATION_ERROR) when the plan id param is missing', async () => {
    const req = { userId: USER_ID, params: {} } as unknown as Request;
    const res = mockRes();

    const error = await retryPlanController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  // --- Test 2b: id không đúng định dạng UUID (PR #160) ---
  it('throws ZodError (400 VALIDATION_ERROR) when the plan id is not a valid UUID', async () => {
    const req = { userId: USER_ID, params: { id: 'not-a-uuid' } } as unknown as Request;
    const res = mockRes();

    const error = await retryPlanController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  // --- Test 3: happy path — 202 + envelope + fire-and-forget trigger ---
  it('returns 202 with the plan envelope and fires background analysis', async () => {
    mockedRetry.mockResolvedValue(planResponse);
    const req = { userId: USER_ID, params: { id: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    await retryPlanController(req, res);

    expect(mockedRetry).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    // Fire-and-forget: analysis is triggered for the same plan, not awaited.
    expect(mockedTrigger).toHaveBeenCalledWith(PLAN_ID);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { plan: planResponse, message: 'Analysis retry initiated' },
    });
  });

  // --- Test 4: service lỗi được propagate (asyncHandler sẽ bắt ở tầng route) ---
  it('propagates service errors and does not respond', async () => {
    const conflict = new AppError('An analysis is already in progress', 409, 'RETRY_NOT_ALLOWED');
    mockedRetry.mockRejectedValue(conflict);
    const req = { userId: USER_ID, params: { id: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    const error = await retryPlanController(req, res).catch((e) => e);
    expect(error).toBe(conflict);
    expect(mockedTrigger).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
