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

export const createPlanSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(255, 'Plan name is too long'),
  deadline: z
    .string()
    .min(1, 'Deadline is required')
    .refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime()) && toVnDateKey(date) >= toVnDateKey(new Date());
    }, 'Deadline must be today or a future date'),
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
