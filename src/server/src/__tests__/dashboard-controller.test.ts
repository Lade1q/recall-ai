import { Request, Response } from 'express';
import { getDashboardStatsController } from '../controllers/dashboard.controller';
import { getDashboardStats } from '../services/dashboard.service';
import { AppError } from '../middleware/errorHandler';

jest.mock('../services/dashboard.service', () => ({
  __esModule: true,
  getDashboardStats: jest.fn(),
}));

const mockedGetDashboardStats = getDashboardStats as jest.Mock;

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDashboardStatsController', () => {
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = {} as unknown as Request;
    const res = mockRes();

    const error = await getDashboardStatsController(req, res).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedGetDashboardStats).not.toHaveBeenCalled();
  });

  it('returns 200 with the { success, data } envelope on success', async () => {
    const stats = {
      studyStreakDays: 12,
      weeklyStudyMinutes: 380,
      conceptsMastered: 31,
      conceptsTotal: 58,
    };
    mockedGetDashboardStats.mockResolvedValue(stats);
    const req = { userId: 'user-1' } as unknown as Request;
    const res = mockRes();

    await getDashboardStatsController(req, res);

    expect(mockedGetDashboardStats).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: stats });
  });
});
