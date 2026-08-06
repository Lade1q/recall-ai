import { Request, Response } from 'express';
import { getDashboardStats } from '../services/dashboard.service';
import { AppError } from '../middleware/errorHandler';

/** GET /api/v1/dashboard/stats — không có input/query param nào cần validate. */
export async function getDashboardStatsController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const stats = await getDashboardStats(req.userId);

  res.status(200).json({ success: true, data: stats });
}
