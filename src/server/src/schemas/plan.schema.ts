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
