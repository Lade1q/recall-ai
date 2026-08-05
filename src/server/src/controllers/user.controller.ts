import { Request, Response } from 'express';
import { getPomodoroConfig, updatePomodoroConfig } from '../services/user.service';
import { updatePomodoroConfigSchema } from '../schemas/user.schema';
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
