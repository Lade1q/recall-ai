import { Request, Response } from 'express';
import {
  changePassword,
  getPomodoroConfig,
  updatePomodoroConfig,
  updateProfile,
} from '../services/user.service';
import {
  changePasswordSchema,
  updatePomodoroConfigSchema,
  updateProfileSchema,
} from '../schemas/user.schema';
import { AppError } from '../middleware/errorHandler';

export async function getPomodoroConfigController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const config = await getPomodoroConfig(req.userId);

  res.status(200).json({ success: true, data: config });
}

export async function updatePomodoroConfigController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const input = updatePomodoroConfigSchema.parse(req.body);
  const config = await updatePomodoroConfig(req.userId, input);

  res.status(200).json({ success: true, data: config });
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const input = updateProfileSchema.parse(req.body);
  const user = await updateProfile(req.userId, input);

  res.status(200).json({ success: true, data: user });
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const input = changePasswordSchema.parse(req.body);
  await changePassword(req.userId, input);

  // Không vọng lại gì của mật khẩu, kể cả một cờ. Client chỉ cần biết là xong.
  res.status(200).json({ success: true, data: { changed: true } });
}
