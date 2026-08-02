import { Request, Response } from 'express';
import {
  getReviewQueueForPlan,
  getTodayReviewQueue,
  updateReviewQueueItemStatus,
} from '../services/scheduling.service';
import {
  getReviewQueueQuerySchema,
  getTodayQueueQuerySchema,
  updateReviewQueueItemSchema,
  reviewQueueItemIdParamSchema,
} from '../schemas/review-queue.schema';
import { AppError } from '../middleware/errorHandler';

/**
 * GET /api/v1/review-queue?planId=&limit=
 * Priority-ordered review queue for one plan (I6.3 auto top-K, I6.7 traceback panel).
 */
export async function getReviewQueueController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { planId, limit } = getReviewQueueQuerySchema.parse(req.query);

  const queue = await getReviewQueueForPlan(planId, req.userId, limit);

  res.status(200).json({
    success: true,
    data: queue,
  });
}

/**
 * GET /api/v1/review-queue/today?limit=
 * Top-K review suggestions across all of the user's active plans (I8.2 "Gợi ý hôm nay").
 */
export async function getTodayReviewQueueController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { limit } = getTodayQueueQuerySchema.parse(req.query);

  const queue = await getTodayReviewQueue(req.userId, limit);

  res.status(200).json({
    success: true,
    data: queue,
  });
}

/**
 * PATCH /api/v1/review-queue/:itemId
 * Accepts or skips a suggestion. Skipped rows are kept, not deleted.
 */
export async function updateReviewQueueItemController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { itemId } = reviewQueueItemIdParamSchema.parse(req.params);

  const { status } = updateReviewQueueItemSchema.parse(req.body);

  const item = await updateReviewQueueItemStatus(itemId, req.userId, status);

  res.status(200).json({
    success: true,
    data: { item },
  });
}
