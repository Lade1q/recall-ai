import { z } from 'zod';
import { registerSchema } from './auth.schema';

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

/**
 * PATCH /users/me (AM-03) — hồ sơ hiện chỉ có đúng một trường sửa được.
 *
 * `name` là cột duy nhất trong `users` mà người dùng sở hữu; email là khoá đăng
 * nhập nên không đổi ở đây. Giới hạn 100 khớp `@db.VarChar(100)` — để rộng hơn
 * thì Postgres mới là chỗ từ chối, và lỗi trả về sẽ là 500 thay vì 400.
 *
 * `.nullable()` vì `User.name` là **`String?`**: `null` nghĩa là *xoá tên*, và
 * `updateProfile` ghi thẳng `data: { name: patch.name }` nên Prisma nhận được.
 * Trước #360 schema này khai `z.string()` trần — kẻ lạc loài duy nhất giữa DB
 * (nullable) và client (gửi `null` khi ô trống), nên xoá tên trả 400 còn người
 * dùng đọc "Không thể lưu. Vui lòng thử lại."
 *
 * ⚠️ `min(2)` vẫn chặn tên **một ký tự** → 400 với cùng câu chung chung đó. Ca
 * này đã biết và đang theo dõi ở #370; DB không đòi độ dài tối thiểu nào
 * (`@db.VarChar(100)` chỉ chặn trên), nên con số 2 là quy ước của tầng này chứ
 * không phải ràng buộc của dữ liệu. Đừng "sửa" nó ở đây mà chưa qua #370.
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * PATCH /users/me/password (AM-04).
 *
 * `currentPassword` chỉ cần `min(1)`: nó được so với hash đã lưu, nên ràng buộc
 * độ mạnh áp cho nó là vô nghĩa — mật khẩu cũ đã tồn tại rồi, và một quy tắc
 * chặt hơn quy tắc lúc đăng ký sẽ khoá luôn những tài khoản cũ hợp lệ.
 *
 * `newPassword` **mượn thẳng** `registerSchema.shape.password` thay vì chép lại
 * luật. Hai đường cùng ghi vào một cột: nới hơn thì đổi-mật-khẩu thành cửa sau
 * của đăng-ký, siết hơn thì hệ thống từ chối chính những mật khẩu nó đã cấp.
 * Chép tay là mời hai bên trôi khỏi nhau về sau; tham chiếu thì không trôi được.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: registerSchema.shape.password,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
