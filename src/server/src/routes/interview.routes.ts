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

// AE-10 (#248). Order-independent, and the reason is the SEGMENT COUNT, not the shape of any one
// route above: every path on this router is one or two segments, this one is three
// (`/turns/:turnId/feedback`), so no `/:id/...` pattern can ever match it. Scoped to the turn
// rather than nested under `/:id` because the parent here IS the turn — adding a session id to
// the URL would buy a second 404 branch ("turn not in this session"), not fewer surfaces.
interviewRouter.post('/turns/:turnId/feedback', asyncHandler(submitGradingFeedbackController));

export { interviewRouter };
