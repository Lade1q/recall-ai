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
 * GET /api/v1/review-queue?planId=&limit=&includeSkipped=
 * Priority-ordered review queue for one plan (I6.3 auto top-K, #225's Kế hoạch ôn tập screen).
 * `includeSkipped=true` adds the "Đã gỡ khỏi lịch" group to the envelope (#224).
 */
export async function getReviewQueueController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { planId, limit, includeSkipped } = getReviewQueueQuerySchema.parse(req.query);

  const queue = await getReviewQueueForPlan(planId, req.userId, limit, { includeSkipped });

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
 * Removes an item from the schedule (`skipped`) or puts it back (`pending`) — #224. Removed rows
 * are kept, not deleted, and are read back via `GET /review-queue?includeSkipped=true`.
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
