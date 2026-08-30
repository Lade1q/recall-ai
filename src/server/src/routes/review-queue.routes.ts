import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  getReviewQueueController,
  getReviewScheduleController,
  getTodayReviewQueueController,
  updateReviewQueueItemController,
} from '../controllers/review-queue.controller';

const reviewQueueRouter = Router();

// All routes are protected via authMiddleware when mounted in app.ts
reviewQueueRouter.get('/', asyncHandler(getReviewQueueController));
reviewQueueRouter.get('/today', asyncHandler(getTodayReviewQueueController));
// Đối xứng với `/today`. Router này không có `get('/:id')` nên không có chuyện literal bị nuốt
// bởi route tham số — khác `planRouter`, nơi `/plans/schedule` sẽ rơi vào `GET /:id`.
reviewQueueRouter.get('/schedule', asyncHandler(getReviewScheduleController));
reviewQueueRouter.patch('/:itemId', asyncHandler(updateReviewQueueItemController));

export { reviewQueueRouter };
