import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getDashboardStatsController } from '../controllers/dashboard.controller';

const dashboardRouter = Router();

// Protected via authMiddleware when mounted in app.ts
dashboardRouter.get('/stats', asyncHandler(getDashboardStatsController));

export { dashboardRouter };
