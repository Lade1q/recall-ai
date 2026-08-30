import { Router } from 'express';
import {
  changePasswordController,
  getPomodoroConfigController,
  updatePomodoroConfigController,
  updateProfileController,
} from '../controllers/user.controller';
import { asyncHandler } from '../middleware/errorHandler';

const userRouter = Router();

userRouter.patch('/me', asyncHandler(updateProfileController));
userRouter.patch('/me/password', asyncHandler(changePasswordController));
userRouter.get('/me/pomodoro-config', asyncHandler(getPomodoroConfigController));
userRouter.patch('/me/pomodoro-config', asyncHandler(updatePomodoroConfigController));

export { userRouter };
