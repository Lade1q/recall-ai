import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { UpdatePomodoroConfigInput } from '../schemas/user.schema';
import { PomodoroConfig } from '../types/focus-session.types';

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
