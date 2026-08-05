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
import {
  createInterviewSchema,
  interviewIdParamSchema,
  submitAnswerSchema,
  submitSelfGradeSchema,
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
