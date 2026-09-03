import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { MAX_FILES_PER_PLAN, UPLOAD_FILE_FIELDS } from '../config/upload-limits';

/**
 * Custom application error class.
 */
export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global centralized error handler middleware.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds maximum limit of 10MB',
        },
      });
    }
    // `LIMIT_UNEXPECTED_FILE` on a field the route DOES accept means "too many files in that
    // field" — multer reaches a field's `maxCount` before busboy's global count, so this, not
    // `LIMIT_FILE_COUNT`, is what an over-long upload actually produces. On any other field it
    // keeps its plain meaning and must not be relabelled.
    const tooManyInAKnownField =
      err.code === 'LIMIT_UNEXPECTED_FILE' && UPLOAD_FILE_FIELDS.includes(err.field ?? '');
    if (err.code === 'LIMIT_FILE_COUNT' || tooManyInAKnownField) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          message: `Too many files in one upload (maximum ${MAX_FILES_PER_PLAN})`,
        },
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
      },
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: err.issues,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'APP_ERROR',
        message: err.message,
      },
    });
  }

  // Handle other known built-in errors (like JSON parsing error)
  if ('status' in err && typeof err.status === 'number' && 'message' in err) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: err.message,
      },
    });
  }

  // Handle default unhandled errors
  console.error('Unhandled error occurrence:', err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}

/**
 * Async handler wrapper to catch unhandled promise rejections
 * and forward them to the global error handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
