import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  abandonInterviewController,
  createInterviewController,
  getInterviewController,
  getSessionSummaryController,
  listInterviewsController,
  pauseInterviewController,
  resumeInterviewController,
  submitAnswerController,
  submitGradingFeedbackController,
} from '../controllers/interview.controller';

const interviewRouter = Router();

// All routes are protected via authMiddleware when mounted in app.ts
interviewRouter.post('/', asyncHandler(createInterviewController));
interviewRouter.get('/', asyncHandler(listInterviewsController));
interviewRouter.get('/:id', asyncHandler(getInterviewController));
interviewRouter.post('/:id/answers', asyncHandler(submitAnswerController));
interviewRouter.post('/:id/pause', asyncHandler(pauseInterviewController));
interviewRouter.post('/:id/resume', asyncHandler(resumeInterviewController));
interviewRouter.post('/:id/abandon', asyncHandler(abandonInterviewController));
interviewRouter.get('/:id/summary', asyncHandler(getSessionSummaryController));

// AE-10 (#248). Mounted BEFORE nothing in particular — `turns` cannot collide with `/:id`
// because that route is `/:id` alone, while this one has two more segments.
interviewRouter.post('/turns/:turnId/feedback', asyncHandler(submitGradingFeedbackController));

export { interviewRouter };
