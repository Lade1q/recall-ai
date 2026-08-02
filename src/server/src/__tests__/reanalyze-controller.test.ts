import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { reanalyzePlanController } from '../controllers/plan.controller';
import { reanalyzePlan } from '../services/plan.service';
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
  reanalyzePlan: jest.fn(),
  updatePlanStatus: jest.fn(),
  deletePlan: jest.fn(),
}));

jest.mock('../services/analysis.service', () => ({
  __esModule: true,
  triggerAnalysis: jest.fn(),
}));

const mockedReanalyze = reanalyzePlan as jest.Mock;
const mockedTrigger = triggerAnalysis as jest.Mock;

const USER_ID = 'user-owner-uuid';
const PLAN_ID = '11111111-1111-4111-8111-111111111111';

const planResponse = {
  id: PLAN_ID,
  name: 'Cấu trúc dữ liệu & Giải thuật',
  deadline: new Date('2026-08-30'),
  status: 'active' as const,
  analysisStatus: 'pending' as const,
};

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('reanalyzePlanController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrigger.mockResolvedValue(undefined);
  });

  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { params: { id: PLAN_ID } } as unknown as Request;

    const error = await reanalyzePlanController(req, mockRes()).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedReanalyze).not.toHaveBeenCalled();
  });

  it('throws ZodError (400 VALIDATION_ERROR) when the plan id param is missing', async () => {
    const req = { userId: USER_ID, params: {} } as unknown as Request;

    const error = await reanalyzePlanController(req, mockRes()).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedReanalyze).not.toHaveBeenCalled();
  });

  it('throws ZodError (400 VALIDATION_ERROR) when the plan id is not a valid UUID', async () => {
    const req = { userId: USER_ID, params: { id: 'not-a-uuid' } } as unknown as Request;

    const error = await reanalyzePlanController(req, mockRes()).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedReanalyze).not.toHaveBeenCalled();
  });

  it('returns 202 with the plan envelope and fires background analysis', async () => {
    mockedReanalyze.mockResolvedValue(planResponse);
    const req = { userId: USER_ID, params: { id: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    await reanalyzePlanController(req, res);

    expect(mockedReanalyze).toHaveBeenCalledWith(PLAN_ID, USER_ID);
    // Fire-and-forget: the request does not wait for Gemini (SP-06 polling).
    expect(mockedTrigger).toHaveBeenCalledWith(PLAN_ID);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { plan: planResponse, message: 'Re-analysis initiated' },
    });
  });

  it('propagates service errors and does not trigger analysis', async () => {
    const conflict = new AppError(
      'An analysis is already in progress',
      409,
      'REANALYZE_NOT_ALLOWED'
    );
    mockedReanalyze.mockRejectedValue(conflict);
    const req = { userId: USER_ID, params: { id: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    const error = await reanalyzePlanController(req, res).catch((e) => e);
    expect(error).toBe(conflict);
    expect(mockedTrigger).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
