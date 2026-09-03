import { z } from 'zod';

// Vietnam has no DST, so a fixed +7h offset is enough to recover the calendar
// day a deadline represents — both for a plain "yyyy-MM-dd" string (parsed as
// UTC midnight) and for "now" on the server, whatever timezone it runs in.
// Comparing raw instants instead would reject "today" for a UTC+7 client that
// still sends a full toISOString() of local midnight (yesterday evening UTC).
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function toVnDateKey(date: Date): string {
  return new Date(date.getTime() + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

// UC-02 A3 "Dán text": alternative to `file` on the same multipart body — the controller
// enforces exactly one of the two is present (Zod alone can't see `req.file`).
const MAX_PASTED_CONTENT_LENGTH = 10_000;

// multipart/form-data normalizes `\n` to `\r\n` in transit (the same mechanism that turns
// a 902-byte paste into 908 bytes on disk), so `.max()` counting the raw field would charge
// pasted content 1 extra character per line it never had — a 91-line, 9,957-character paste
// was rejected as "too long" at 10,048 raw characters (Review #363). Undo it before counting
// or storing, so the cap reflects what the student actually typed.
function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

export const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(255, 'Plan name is too long'),
  deadline: z
    .string()
    .min(1, 'Deadline is required')
    .refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime()) && toVnDateKey(date) >= toVnDateKey(new Date());
    }, 'Deadline must be today or a future date'),
  // A multipart form that submits a file also submits an untouched `content` textarea as
  // `''`, not as an absent field — treat that the same as "not provided" so a file upload
  // doesn't fail validation on an empty paste-text field it never meant to use. Trimmed to
  // whitespace-only, not just exact `''`: a stray space typed into the textarea while
  // uploading a file is the same "never meant to use this field" case (Review #363).
  content: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z
      .string()
      .transform((val) => normalizeLineEndings(val).trim())
      .refine((val) => val.length > 0, 'Pasted content cannot be empty')
      .refine((val) => val.length <= MAX_PASTED_CONTENT_LENGTH, {
        error: (issue) =>
          `Pasted content is too long (max ${MAX_PASTED_CONTENT_LENGTH} characters, got ${(issue.input as string).length})`,
      })
      .optional()
  ),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/**
 * PATCH /plans/:id — archiving a finished plan and pulling it back out (SP-04).
 *
 * `draft` is deliberately not accepted: it means "AI has not produced concepts yet", a state
 * only the analysis pipeline may set. Letting a client send it would strand a plan with a
 * full graph in the analysing tab forever.
 */
export const updatePlanStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

export type UpdatePlanStatusInput = z.infer<typeof updatePlanStatusSchema>;

/**
 * Shared params schema for every /plans/:id route (Issue liên quan PR #160) — id là
 * @db.Uuid trong Prisma nên một chuỗi không phải UUID sẽ ném P2023 chưa được map,
 * rớt xuống 500 INTERNAL_ERROR nếu không chặn ở đây trước khi gọi service.
 */
export const planIdParamSchema = z.object({
  id: z.string().uuid('Plan ID must be a valid UUID'),
});

/**
 * Params cho route lồng GET /plans/:id/concepts/:conceptId (DB-06, Issue #168). `conceptId`
 * cũng là @db.Uuid nên mang đúng rủi ro P2023→500 như `id`; validate cả hai trước khi chạm
 * Prisma. Kế thừa planIdParamSchema để dùng lại y hệt thông điệp lỗi cho `id`.
 */
export const conceptDetailParamsSchema = planIdParamSchema.extend({
  conceptId: z.string().uuid('Concept ID must be a valid UUID'),
});

/**
 * Params cho route lồng GET /plans/:id/documents/:documentId (Issue #203). Cùng lý do như
 * `conceptDetailParamsSchema`: `documentId` là @db.Uuid, id rác không chặn ở đây sẽ thành
 * P2023 → 500 thay vì 400.
 */
export const planDocumentParamsSchema = planIdParamSchema.extend({
  documentId: z.string().uuid('Document ID must be a valid UUID'),
});

/**
 * Body cho POST /plans/:id/documents (§4 — thêm tài liệu vào kế hoạch đã có).
 *
 * `mode` KHÔNG có mặc định, và đó là một quyết định chứ không phải thiếu sót: hai chế độ đánh
 * đổi ngược nhau (đọc lại toàn bộ thì chính xác nhưng tốn N lượt AI; chỉ đọc tệp mới thì nhanh
 * nhưng khái niệm mới không có cạnh nào sang khái niệm cũ). Đoán hộ người dùng ở đây là chọn hộ
 * họ một đánh đổi mà màn hình đã bày ra cho họ chọn.
 */
export const addPlanDocumentsSchema = z.object({
  mode: z.enum(['full', 'append'], {
    message: 'mode must be either "full" or "append"',
  }),
});

export type AddPlanDocumentsInput = z.infer<typeof addPlanDocumentsSchema>;
