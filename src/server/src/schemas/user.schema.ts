import { z } from 'zod';

/**
 * PATCH /users/me/pomodoro-config (FS-02) — partial update, merge vào JSON hiện có ở
 * `users.pomodoro_config`. Tên field giữ snake_case để khớp với JSON mặc định đang lưu
 * trong DB (`{"work":25,"short_break":5,"long_break":15,"cycles":4,"sound":true}`).
 */
export const updatePomodoroConfigSchema = z
  .object({
    work: z.number().int('work must be an integer').min(1).max(120),
    short_break: z.number().int('short_break must be an integer').min(1).max(60),
    long_break: z.number().int('long_break must be an integer').min(1).max(60),
    cycles: z.number().int('cycles must be an integer').min(1).max(10),
    sound: z.boolean(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export type UpdatePomodoroConfigInput = z.infer<typeof updatePomodoroConfigSchema>;
