import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createPlanInDb, getUserPlans, getPlanById } from '../services/plan.service';
import { createPlanSchema } from '../schemas/plan.schema';
import { createStorageService } from '../services/storage.service';
import { triggerAnalysis } from '../services/analysis.service';
import { AppError } from '../middleware/errorHandler';

const storageService = createStorageService();

/**
 * POST /api/v1/plans
 * Creates a new StudyPlan and triggers background analysis.
 * Expects multipart/form-data with fields: name, deadline, file.
 */
export async function createPlanController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  if (!req.file) {
    throw new AppError('File is required', 400, 'FILE_REQUIRED');
  }

  const localFilePath = req.file.path;
  let uploadedFileKey: string | null = null;

  try {
    // 1. Validate inputs (Zod) trước tiên
    const input = createPlanSchema.parse(req.body);

    // 2. Generate uuid cho StudyPlan trước
    const planId = crypto.randomUUID();
    const ext = path.extname(req.file.originalname);
    uploadedFileKey = `plans/${planId}/${Date.now()}${ext}`;

    // 3. Upload lên Storage Service ngoài DB transaction
    await storageService.upload(localFilePath, uploadedFileKey);

    // 4. Lưu metadata vào DB
    const plan = await createPlanInDb(req.userId, planId, input, uploadedFileKey);

    // 5. Kích hoạt phân tích Gemini chạy nền — response không đợi (SP-06 polling).
    void triggerAnalysis(planId).catch((err) =>
      console.error(`[analysis] trigger failed for plan ${planId}:`, err)
    );

    res.status(201).json({
      success: true,
      data: {
        plan,
        message: 'Plan created',
      },
    });
  } catch (error) {
    // 6. Cleanup orphaned files on any error (validation, DB, etc.)

    // Delete staging file if it hasn't been moved yet
    try {
      await fs.promises.access(localFilePath);
      await fs.promises.unlink(localFilePath);
    } catch {
      // File already moved or doesn't exist — no cleanup needed
    }

    // Delete uploaded file from storage if DB transaction failed after upload
    if (uploadedFileKey) {
      try {
        await storageService.delete(uploadedFileKey);
      } catch (err) {
        console.error('Failed to delete uploaded file key from storage:', err);
      }
    }

    throw error;
  }
}

/**
 * GET /api/v1/plans
 * Lists all study plans belonging to the current user.
 */
export async function listPlansController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const plans = await getUserPlans(req.userId);

  res.status(200).json({
    success: true,
    data: {
      plans,
    },
  });
}

/**
 * GET /api/v1/plans/:id
 * Fetches details of a specific study plan including concepts and edges.
 */
export async function getPlanByIdController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    throw new AppError('Plan ID is required', 400, 'BAD_REQUEST');
  }

  const plan = await getPlanById(id, req.userId);

  res.status(200).json({
    success: true,
    data: plan,
  });
}
