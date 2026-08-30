import { Request, Response } from 'express';
import {
  getReviewQueueForPlan,
  getTodayReviewQueue,
  setReviewQueueItemScheduledFor,
  snoozeReviewQueueItem,
  updateReviewQueueItemStatus,
} from '../services/scheduling.service';
import { getReviewSchedule } from '../services/review-schedule.service';
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
 * GET /api/v1/review-queue/schedule
 * Toàn bộ lịch ôn của user, mỗi mục kèm ngày (#402 — màn Lịch của `/plans`).
 *
 * Không param, không query, không body ⇒ mã lỗi duy nhất là `401` đã có sẵn. `new Date()` đọc ở
 * đây rồi truyền xuống, giữ service không đọc đồng hồ (R05).
 */
export async function getReviewScheduleController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const schedule = await getReviewSchedule(req.userId, new Date());

  res.status(200).json({
    success: true,
    data: schedule,
  });
}

/**
 * PATCH /api/v1/review-queue/:itemId — ba thao tác trên cùng một tài nguyên, phân biệt bằng
 * hình dạng body (xem `updateReviewQueueItemSchema`):
 *
 * - `{ status }` → gỡ khỏi lịch (`skipped`) / đưa lại (`pending`) — #224. Hàng bị gỡ được giữ
 *   lại chứ không xoá, và đọc lại được qua `GET /review-queue?includeSkipped=true`.
 * - `{ snooze: true }` → hoãn đến 00:00 ngày mai giờ VN, `status` không đổi — DB-09 / #233.
 * - `{ scheduledFor }` → dời sang NGÀY người dùng chọn, `status` không đổi — màn Lịch #400 (#403).
 *
 * `new Date()` được đọc ở đây và truyền xuống service: tầng dưới giữ nguyên hợp đồng "không đọc
 * đồng hồ" để mốc ngày vẫn unit-test được (SDP R05).
 */
export async function updateReviewQueueItemController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { itemId } = reviewQueueItemIdParamSchema.parse(req.params);

  const body = updateReviewQueueItemSchema.parse(req.body);

  const item =
    'snooze' in body
      ? await snoozeReviewQueueItem(itemId, req.userId, new Date())
      : 'scheduledFor' in body
        ? await setReviewQueueItemScheduledFor(itemId, req.userId, body.scheduledFor, new Date())
        : await updateReviewQueueItemStatus(itemId, req.userId, body.status);

  res.status(200).json({
    success: true,
    data: { item },
  });
}
