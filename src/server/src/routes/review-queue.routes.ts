import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  getReviewQueueController,
  getTodayReviewQueueController,
  updateReviewQueueItemController,
} from '../controllers/review-queue.controller';

const reviewQueueRouter = Router();

// All routes are protected via authMiddleware when mounted in app.ts
reviewQueueRouter.get('/', asyncHandler(getReviewQueueController));
reviewQueueRouter.get('/today', asyncHandler(getTodayReviewQueueController));
reviewQueueRouter.patch('/:itemId', asyncHandler(updateReviewQueueItemController));

export { reviewQueueRouter };
