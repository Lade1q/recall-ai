import { z } from 'zod';

/**
 * Ghi chú nhanh trong phiên (FS-05) — lồng dưới `/focus-sessions/:id/notes[/:noteId]`.
 *
 * Cả `:id` (phiên) lẫn `:noteId` (ghi chú) đều là `@db.Uuid` trong Prisma; một chuỗi không phải
 * UUID ném `P2023` chưa được errorHandler map → rớt xuống 500 nếu không chặn ở đây trước khi gọi
 * service (cùng lớp lỗi #165/#191 đã vá cho /plans và /review-queue).
 */
export const sessionNoteSessionParamSchema = z.object({
  id: z.string().uuid('Focus session ID must be a valid UUID'),
});

export type SessionNoteSessionParam = z.infer<typeof sessionNoteSessionParamSchema>;

export const sessionNoteParamSchema = z.object({
  id: z.string().uuid('Focus session ID must be a valid UUID'),
  noteId: z.string().uuid('Note ID must be a valid UUID'),
});

export type SessionNoteParam = z.infer<typeof sessionNoteParamSchema>;

/**
 * `body` trim trước, rồi mới kiểm độ dài: một ghi chú chỉ có khoảng trắng không phải nội dung, nên
 * rỗng-sau-trim rơi vào `min(1)` → 400. `max(5000)` cũng đo trên chuỗi đã trim để giới hạn phản
 * ánh đúng phần nội dung thật, không phải phần đệm khoảng trắng.
 */
const noteBodySchema = z
  .string()
  .trim()
  .min(1, 'body must not be empty')
  .max(5000, 'body must be at most 5000 characters');

/** POST /focus-sessions/:id/notes — tạo ghi chú neo vào một khái niệm của phiên. */
export const createSessionNoteSchema = z.object({
  conceptId: z.string().uuid('conceptId must be a valid UUID'),
  body: noteBodySchema,
});

export type CreateSessionNoteInput = z.infer<typeof createSessionNoteSchema>;

/**
 * PATCH /focus-sessions/:id/notes/:noteId — đường mà auto-save đi. Chỉ sửa `body`; khái niệm đã
 * neo lúc tạo, không đổi (đổi khái niệm = ghi chú khác, tạo cái mới).
 */
export const updateSessionNoteSchema = z.object({
  body: noteBodySchema,
});

export type UpdateSessionNoteInput = z.infer<typeof updateSessionNoteSchema>;
