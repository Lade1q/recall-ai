import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  abandonInterviewController,
  createInterviewController,
  getInterviewController,
  getSessionSummaryController,
  pauseInterviewController,
  resumeInterviewController,
  submitAnswerController,
} from '../controllers/interview.controller';

const interviewRouter = Router();

// All routes are protected via authMiddleware when mounted in app.ts
interviewRouter.post('/', asyncHandler(createInterviewController));
interviewRouter.get('/:id', asyncHandler(getInterviewController));
interviewRouter.post('/:id/answers', asyncHandler(submitAnswerController));
interviewRouter.post('/:id/pause', asyncHandler(pauseInterviewController));
interviewRouter.post('/:id/resume', asyncHandler(resumeInterviewController));
interviewRouter.post('/:id/abandon', asyncHandler(abandonInterviewController));
interviewRouter.get('/:id/summary', asyncHandler(getSessionSummaryController));

export { interviewRouter };
