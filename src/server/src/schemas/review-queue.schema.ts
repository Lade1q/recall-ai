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
const updateStatusBodySchema = z.object({ status: z.enum(['skipped', 'pending']) }).strict();

/**
 * Nhánh thứ hai: **hoãn đến mai** (DB-09 / #233). Cờ trần, không tham số.
 *
 * `snooze` KHÔNG mang ngày: biên "đầu ngày mai theo giờ VN" thuộc về server (`getVnTomorrowStartUtc`),
 * cùng mốc mà streak của #200 dùng. Cho client gửi `snoozedUntil` là giao mốc ngày cho một cái
 * đồng hồ ở múi giờ bất kỳ, và mở đường cho `now + 24h` mà AC cấm thẳng.
 *
 * `z.literal(true)` chứ không phải `z.boolean()`: `{ "snooze": false }` sẽ là một lệnh không có
 * nghĩa (không-hoãn), và nếu nhận thì nó lặng lẽ thành no-op 200 — đúng loại phản hồi khiến
 * người gọi tưởng đã hoãn xong.
 */
const snoozeBodySchema = z.object({ snooze: z.literal(true) }).strict();

/**
 * Hai hình dạng, một endpoint. Đây là body của **cùng một tài nguyên**, nên gộp bằng union chứ
 * không đẻ endpoint thứ hai (AC #233). Hai shape khác nhau vì hai thao tác đổi hai trục khác
 * nhau: "bỏ qua" đổi `status`, "hoãn" đổi *ngày đến hạn* — và giữ nguyên `status`.
 *
 * Cộng thuần, không sửa nhánh cũ: `{ status }` mà #224/#225 đang gửi live đi qua đây y hệt như
 * trước. `.strict()` ở cả hai nhánh nên một body lẫn cả `status` lẫn `snooze` bị 400 rõ ràng
 * thay vì để một trong hai âm thầm rơi mất.
 *
 * `error` thay câu mặc định `"Invalid input"` của union — câu đó không nói được body sai ở đâu,
 * vì union hỏng thì mọi nhánh đều hỏng. Câu này nêu thẳng cả hai hình dạng hợp lệ.
 *
 * Giới hạn đã đo, đừng tưởng nó dọn sạch response: zod **vẫn** kèm mảng `errors` của từng nhánh
 * trong chính issue đó, và `errorHandler` trả nguyên `err.issues` vào `details` — nên `details`
 * vẫn có phần lồng, và `error.message` của response vẫn là câu chung `"Invalid input data"`.
 * Dọn hai chỗ đó là sửa `middleware/errorHandler.ts`, tức chạm mọi endpoint có Zod — không đáng
 * cho một endpoint. Câu rõ nằm ở `details[0].message`.
 */
export const updateReviewQueueItemSchema = z.union([updateStatusBodySchema, snoozeBodySchema], {
  error: () => "body must be { status: 'skipped' | 'pending' } or { snooze: true }",
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
