import { z } from 'zod';

const limitSchema = z.coerce
  .number()
  .int('limit must be an integer')
  .positive('limit must be greater than 0')
  .max(50, 'limit must be at most 50')
  .optional();

/**
 * Query param là chuỗi, nên `z.coerce.boolean()` không dùng được ở đây: nó coi mọi chuỗi khác
 * rỗng là `true`, kể cả `"false"`. Chỉ đúng hai chữ được chấp nhận, sai chính tả thì 400 chứ
 * không im lặng hiểu thành `false`.
 */
const booleanQueryFlagSchema = z
  .enum(['true', 'false'], { message: 'must be "true" or "false"' })
  .optional()
  .transform((value) => value === 'true');

export const getReviewQueueQuerySchema = z.object({
  planId: z.string().uuid('planId must be a valid UUID'),
  limit: limitSchema,
  /**
   * `includeSkipped=true` gắn thêm mảng `skippedItems` vào envelope — nhóm "Đã gỡ khỏi lịch"
   * mà màn Kế hoạch ôn tập (#225) cần để đưa mục trở lại. Mặc định tắt: I6.3 tự chọn top-K
   * khái niệm cho phiên Interview mới thì không quan tâm phần đã gỡ, không nên trả thêm một
   * query cho nó. Xem `docs/api/review-queue.md` mục 1.
   */
  includeSkipped: booleanQueryFlagSchema,
});

export type GetReviewQueueQuery = z.infer<typeof getReviewQueueQuerySchema>;

export const getTodayQueueQuerySchema = z.object({
  limit: limitSchema,
});

export type GetTodayQueueQuery = z.infer<typeof getTodayQueueQuerySchema>;

/**
 * PATCH /review-queue/:itemId — hai chiều của **một** thao tác: `'skipped'` gỡ khỏi lịch,
 * `'pending'` đưa lại. Khái niệm nền đã được truy ngược áp thẳng vào lịch lúc chấm xong (#224,
 * 04/08/2026), nên endpoint này không còn là cổng duyệt mà là nút sửa lại — và sửa lại thì phải
 * đi được cả hai chiều, nếu không thì "sửa bất cứ lúc nào" chỉ là cửa một chiều.
 *
 * `'accepted'` bị loại khỏi bộ giá trị: nó là di tích của mô hình cũ (xem doc enum trong
 * `schema.prisma`), gửi lên sẽ 400 VALIDATION_ERROR chứ không im lặng thành no-op.
 * `'done'` vẫn không nhận: chưa code path nào ghi giá trị đó, và nó không phải việc của người dùng.
 */
export const updateReviewQueueItemSchema = z.object({
  status: z.enum(['skipped', 'pending']),
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
