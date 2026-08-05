import { Router } from 'express';
import {
  getPomodoroConfigController,
  updatePomodoroConfigController,
} from '../controllers/user.controller';
import { asyncHandler } from '../middleware/errorHandler';

const userRouter = Router();

userRouter.get('/me/pomodoro-config', asyncHandler(getPomodoroConfigController));
userRouter.patch('/me/pomodoro-config', asyncHandler(updatePomodoroConfigController));

export { userRouter };
