import { z } from 'zod';

const limitSchema = z.coerce
  .number()
  .int('limit must be an integer')
  .positive('limit must be greater than 0')
  .max(50, 'limit must be at most 50')
  .optional();

export const getReviewQueueQuerySchema = z.object({
  planId: z.string().uuid('planId must be a valid UUID'),
  limit: limitSchema,
});

export type GetReviewQueueQuery = z.infer<typeof getReviewQueueQuerySchema>;

export const getTodayQueueQuerySchema = z.object({
  limit: limitSchema,
});

export type GetTodayQueueQuery = z.infer<typeof getTodayQueueQuerySchema>;

/**
 * PATCH /review-queue/:itemId — chỉ chấp nhận 'accepted' | 'skipped'. Không cho set lại
 * 'pending' hay 'done' qua endpoint này (đó là việc của I7.2's upsert / I6.5's flow riêng).
 */
export const updateReviewQueueItemSchema = z.object({
  status: z.enum(['accepted', 'skipped']),
});

export type UpdateReviewQueueItemInput = z.infer<typeof updateReviewQueueItemSchema>;

/**
 * PATCH /review-queue/:itemId — `ReviewQueueItem.id` là `@db.Uuid` trong Prisma; một `itemId`
 * không phải UUID sẽ ném `P2023` (chưa được errorHandler map → rớt xuống 500) nếu không chặn
 * ở đây trước khi gọi service. Cùng lớp lỗi #165/#191 đã vá cho các route /plans.
 */
export const reviewQueueItemIdParamSchema = z.object({
  itemId: z.string().uuid('itemId must be a valid UUID'),
});

export type ReviewQueueItemIdParam = z.infer<typeof reviewQueueItemIdParamSchema>;
