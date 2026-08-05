import { z } from 'zod';

/**
 * FocusSession.id là @db.Uuid trong Prisma — một chuỗi không phải UUID sẽ ném P2023 chưa
 * được map, rớt xuống 500 INTERNAL_ERROR nếu không chặn ở đây trước khi gọi service (cùng
 * lớp lỗi #165/#191 đã vá cho /plans và /review-queue).
 */
export const focusSessionIdParamSchema = z.object({
  id: z.string().uuid('Focus session ID must be a valid UUID'),
});

export type FocusSessionIdParam = z.infer<typeof focusSessionIdParamSchema>;

/** POST /focus-sessions (FS-01 bước 1-3). */
export const createFocusSessionSchema = z.object({
  planId: z.string().uuid('planId must be a valid UUID').optional(),
  conceptIds: z
    .array(z.string().uuid('conceptIds must contain valid UUIDs'))
    .min(1, 'conceptIds must not be empty'),
  strictMode: z.boolean().optional(),
});

export type CreateFocusSessionInput = z.infer<typeof createFocusSessionSchema>;

/**
 * PATCH /focus-sessions/:id — kết thúc hoặc hủy phiên (FS-01 Alt flow 1/3/4).
 * `running` không được chấp nhận ở đây: nó là trạng thái khởi tạo, chỉ POST mới được đặt.
 */
export const endFocusSessionSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
  focusedSeconds: z
    .number()
    .int('focusedSeconds must be an integer')
    .min(0, 'focusedSeconds must not be negative')
    .max(28800, 'focusedSeconds must not exceed 8 hours (28800s)'),
  awayCount: z
    .number()
    .int('awayCount must be an integer')
    .min(0, 'awayCount must not be negative')
    .optional(),
  pomodorosCompleted: z
    .number()
    .int('pomodorosCompleted must be an integer')
    .min(0, 'pomodorosCompleted must not be negative')
    .optional(),
});

export type EndFocusSessionInput = z.infer<typeof endFocusSessionSchema>;

/** GET /focus-sessions?limit=&offset= (FS-03 lịch sử). */
export const listFocusSessionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .positive('limit must be greater than 0')
    .max(50, 'limit must be at most 50')
    .optional(),
  offset: z.coerce
    .number()
    .int('offset must be an integer')
    .min(0, 'offset must not be negative')
    .optional(),
});

export type ListFocusSessionsQuery = z.infer<typeof listFocusSessionsQuerySchema>;
