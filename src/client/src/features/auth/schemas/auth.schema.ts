import { z } from 'zod';

// 1. Schema for login
// Mật khẩu chỉ cần không rỗng — KHÔNG áp min(8) ở đây. Server (loginSchema) dùng
// `password.min(1)`; nếu client chặt hơn thì vừa từ chối nhầm mật khẩu mà server
// chấp nhận, vừa lộ chính sách độ dài ngay trên màn đăng nhập. Quy tắc ≥ 8 ký tự
// chỉ thuộc về màn đăng ký (registerSchema).
export const loginSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Địa chỉ email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

// 2. Schema for register
export const registerSchema = z
  .object({
    name: z.string().min(2, 'Tên phải có ít nhất 2 ký tự'),
    email: z.string().min(1, 'Vui lòng nhập email').email('Địa chỉ email không hợp lệ'),
    password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Hai mật khẩu chưa giống nhau',
    path: ['confirmPassword'],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
