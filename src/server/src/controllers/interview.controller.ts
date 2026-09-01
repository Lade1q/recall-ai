import { Request, Response } from 'express';
import {
  abandonInterview,
  getInterview,
  pauseInterview,
  resumeInterview,
  startInterview,
  submitAnswer,
  submitSelfGrade,
} from '../services/interview.service';
import { getSessionSummary } from '../services/session-summary.service';
import { submitGradingFeedback } from '../services/grading-feedback.service';
import { listInterviews } from '../services/interview-history.service';
import {
  createInterviewSchema,
  interviewIdParamSchema,
  listInterviewsQuerySchema,
  submitAnswerSchema,
  submitSelfGradeSchema,
  turnIdParamSchema,
  gradingFeedbackSchema,
} from '../schemas/interview.schema';
import { AppError } from '../middleware/errorHandler';

/**
 * Interview API (I6.3 / #115). Every route is mounted behind `authMiddleware`, and every
 * handler validates its input with Zod before the service is reached (conventions §4.4).
 */

/**
 * POST /api/v1/interviews — AE-01. Starts a session and returns its first question.
 *
 * `201` for a session that was created, `200` when an unfinished one already existed and is
 * being handed back to resume (AE-03) — the body carries it either way, so the client can
 * offer "tiếp tục phiên" instead of hitting a dead end.
 */
export async function createInterviewController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const input = createInterviewSchema.parse(req.body);

  const result = await startInterview(req.userId, input);

  res.status(result.created ? 201 : 200).json({
    success: true,
    data: result,
  });
}

/**
 * GET /api/v1/interviews/:id
 * Current state, the question waiting for an answer, and the transcript so far.
 */
export async function getInterviewController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = interviewIdParamSchema.parse(req.params);

  const result = await getInterview(id, req.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
}

/**
 * GET /api/v1/interviews — SPEC_DB-03. Session history, newest first, `limit`/`offset` paged.
 * Read-only: no `mastery_score` write, no AI call.
 */
export async function listInterviewsController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { limit, offset, planId } = listInterviewsQuerySchema.parse(req.query);

  const result = await listInterviews(req.userId, { limit, offset, planId });

  res.status(200).json({
    success: true,
    data: result,
  });
}

/**
 * POST /api/v1/interviews/:id/answers — AE-02, or AE-05's flashcard self-grade when the body
 * carries `selfGrade` instead of `answerText`. Routed on the body's own shape, before either
 * schema is parsed — `fallbackMode` itself isn't known until the session loads, so which schema
 * applies has to come from what the client actually sent, not from session state read here.
 */
export async function submitAnswerController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = interviewIdParamSchema.parse(req.params);

  if (req.body && 'selfGrade' in req.body) {
    const { selfGrade } = submitSelfGradeSchema.parse(req.body);
    const result = await submitSelfGrade(id, req.userId, selfGrade);
    res.status(200).json({ success: true, data: result });
    return;
  }

  const { answerText } = submitAnswerSchema.parse(req.body);
  const result = await submitAnswer(id, req.userId, answerText);

  res.status(200).json({
    success: true,
    data: result,
  });
}

/** POST /api/v1/interviews/:id/pause — AE-03. */
export async function pauseInterviewController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = interviewIdParamSchema.parse(req.params);

  const result = await pauseInterview(id, req.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
}

/**
 * GET /api/v1/interviews/:id/summary — AE-09. The end-of-session report: per-concept scores,
 * an AI-written summary (generated once and cached — see `session-summary.service.ts`), and
 * the traceback (AE-08) queued for the next session.
 */
export async function getSessionSummaryController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = interviewIdParamSchema.parse(req.params);

  const result = await getSessionSummary(id, req.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
}

/** POST /api/v1/interviews/:id/resume — AE-03. */
export async function resumeInterviewController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = interviewIdParamSchema.parse(req.params);

  const result = await resumeInterview(id, req.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
}

/**
 * POST /api/v1/interviews/:id/abandon — SPEC_DB-03 AF2 (#243). Ends an unfinished session and
 * scores the concept it stopped on, on the turns it actually got. Takes no body: what happens
 * to the half-finished concept is the endpoint's own rule, not the client's to choose.
 */
export async function abandonInterviewController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = interviewIdParamSchema.parse(req.params);

  const result = await abandonInterview(id, req.userId);

  res.status(200).json({
    success: true,
    data: result,
  });
}

/**
 * POST /api/v1/interviews/turns/:turnId/feedback — AE-10 (#248). Logs the student's
 * disagreement with one turn's score.
 *
 * `200` rather than `201`: the endpoint is an upsert keyed on `(turnId, userId)`, so a second
 * submit edits the same row and there is no new resource to report.
 */
export async function submitGradingFeedbackController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { turnId } = turnIdParamSchema.parse(req.params);
  const body = gradingFeedbackSchema.parse(req.body);

  const result = await submitGradingFeedback(turnId, req.userId, body);

  res.status(200).json({
    success: true,
    data: result,
  });
}
