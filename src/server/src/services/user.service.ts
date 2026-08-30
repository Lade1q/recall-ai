import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  ChangePasswordInput,
  UpdatePomodoroConfigInput,
  UpdateProfileInput,
} from '../schemas/user.schema';
import { PomodoroConfig } from '../types/focus-session.types';
import { UserResponse } from '../types/auth.types';

/** Cùng cost factor với register/login (`auth.service.ts`) — một hệ thống, một hash. */
const SALT_ROUNDS = 10;

const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  work: 25,
  short_break: 5,
  long_break: 15,
  cycles: 4,
  sound: true,
};

function toPomodoroConfig(value: unknown): PomodoroConfig {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_POMODORO_CONFIG;
  }
  const record = value as Record<string, unknown>;
  return {
    work: typeof record.work === 'number' ? record.work : DEFAULT_POMODORO_CONFIG.work,
    short_break:
      typeof record.short_break === 'number'
        ? record.short_break
        : DEFAULT_POMODORO_CONFIG.short_break,
    long_break:
      typeof record.long_break === 'number'
        ? record.long_break
        : DEFAULT_POMODORO_CONFIG.long_break,
    cycles: typeof record.cycles === 'number' ? record.cycles : DEFAULT_POMODORO_CONFIG.cycles,
    sound: typeof record.sound === 'boolean' ? record.sound : DEFAULT_POMODORO_CONFIG.sound,
  };
}

/** GET /users/me/pomodoro-config (FS-02). */
export async function getPomodoroConfig(userId: string): Promise<PomodoroConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pomodoroConfig: true },
  });
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return toPomodoroConfig(user.pomodoroConfig);
}

/** PATCH /users/me/pomodoro-config (FS-02) — partial update, merge vào JSON hiện có. */
export async function updatePomodoroConfig(
  userId: string,
  patch: UpdatePomodoroConfigInput
): Promise<PomodoroConfig> {
  const current = await getPomodoroConfig(userId);
  const merged: PomodoroConfig = { ...current, ...patch };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { pomodoroConfig: merged as unknown as Prisma.InputJsonValue },
  });

  return toPomodoroConfig(updated.pomodoroConfig);
}

/** PATCH /users/me (AM-03) — đổi tên hiển thị, trường hồ sơ duy nhất người dùng sở hữu. */
export async function updateProfile(
  userId: string,
  patch: UpdateProfileInput
): Promise<UserResponse> {
  const user = await prisma.user
    .update({
      where: { id: userId },
      data: { name: patch.name },
    })
    .catch(() => {
      // `update` ném P2025 khi không có hàng khớp. Ca này chỉ tới được khi tài
      // khoản bị xoá trong lúc token còn hạn — hiếm, nhưng để lọt ra ngoài thì
      // client nhận 500 cho một tình huống 404.
      throw new AppError('User not found', 404, 'NOT_FOUND');
    });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * PATCH /users/me/password (AM-04).
 *
 * Bump `tokenVersion` **trong cùng một câu update** với hash mới, không phải hai
 * lệnh nối nhau: tách ra thì có một khoảng — dù ngắn — mà mật khẩu đã đổi nhưng
 * các phiên cũ vẫn còn hiệu lực, và nếu tiến trình chết đúng lúc đó thì khoảng
 * ấy là vĩnh viễn.
 *
 * Không trả gì. Hàm này biết mật khẩu ở dạng rõ, nên thứ ít rủi ro nhất nó có
 * thể trả về là không gì cả.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const isCurrentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    // Mã `WRONG_PASSWORD` là hợp đồng với client: form đổi mật khẩu bắt đúng
    // chuỗi này để gắn lỗi vào ô "mật khẩu hiện tại" thay vì báo lỗi chung.
    // Đổi tên mã ở đây là làm hỏng màn hình đó mà không có gì đỏ lên.
    throw new AppError('Current password is incorrect', 400, 'WRONG_PASSWORD');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
}
