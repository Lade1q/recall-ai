import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/\S/, 'Password must not consist only of whitespace'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/\S/, 'Password must not consist only of whitespace'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
