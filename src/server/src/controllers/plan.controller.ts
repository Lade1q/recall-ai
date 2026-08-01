import { Request, Response } from 'express';
import { DocumentKind } from '@prisma/client';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import {
  createPlanInDb,
  getUserPlans,
  getPlanById,
  retryPlanAnalysis,
  changePlanDocument,
  reanalyzePlan,
  updatePlanStatus,
  deletePlan,
} from '../services/plan.service';
import { createPlanSchema, updatePlanStatusSchema } from '../schemas/plan.schema';
import { createStorageService } from '../services/storage.service';
import { triggerAnalysis } from '../services/analysis.service';
import { invalidatePlanMaterial } from '../services/gemini.service';
import { getPdfPageCount } from '../utils/pdf';
import { DocumentMeta } from '../types/plan.types';
import { AppError } from '../middleware/errorHandler';

const storageService = createStorageService();

/** Maps an uploaded file's extension to a DocumentKind (SP-01 accepts pdf/image/text). */
function documentKindFromExt(ext: string): DocumentKind {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.png' || e === '.jpg' || e === '.jpeg') return 'image';
  return 'text';
}

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

    // 3. Thu thập metadata tài liệu. page_count đọc từ file cục bộ TRƯỚC khi upload
    //    (upload sẽ move/unlink file staging) — best-effort, chỉ cho PDF.
    const kind = documentKindFromExt(ext);
    const pageCount = kind === 'pdf' ? await getPdfPageCount(localFilePath) : null;
    const documentMeta: DocumentMeta = {
      filename: req.file.originalname,
      fileKey: uploadedFileKey,
      kind,
      pageCount,
      byteSize: req.file.size ?? null,
    };

    // 4. Upload lên Storage Service ngoài DB transaction
    await storageService.upload(localFilePath, uploadedFileKey);

    // 5. Lưu metadata vào DB (plan + document + analysis job)
    const plan = await createPlanInDb(req.userId, planId, input, documentMeta);

    // 6. Kích hoạt phân tích Gemini chạy nền — response không đợi (SP-06 polling).
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
    // 7. Cleanup orphaned files on any error (validation, DB, etc.)

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

/**
 * POST /api/v1/plans/:id/retry
 * Retries analysis for a failed plan without re-uploading the file (Issue #106).
 */
export async function retryPlanController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    throw new AppError('Plan ID is required', 400, 'BAD_REQUEST');
  }

  const plan = await retryPlanAnalysis(id, req.userId);

  // Fire-and-forget — same pattern as createPlanController
  void triggerAnalysis(id).catch((err) =>
    console.error(`[analysis] retry trigger failed for plan ${id}:`, err)
  );

  res.status(202).json({
    success: true,
    data: { plan, message: 'Analysis retry initiated' },
  });
}

/**
 * POST /api/v1/plans/:id/document
 * Swaps the source file of a draft plan whose analysis failed, and starts a fresh job
 * against the new file (Issue #187) — the "Đổi tài liệu khác" alt flow, for when a same-file
 * retry (#106) can't help because the original file itself was the problem.
 * Expects multipart/form-data with field: file.
 */
export async function changePlanDocumentController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    throw new AppError('Plan ID is required', 400, 'BAD_REQUEST');
  }

  if (!req.file) {
    throw new AppError('File is required', 400, 'FILE_REQUIRED');
  }

  const localFilePath = req.file.path;
  let uploadedFileKey: string | null = null;

  try {
    const ext = path.extname(req.file.originalname);
    uploadedFileKey = `plans/${id}/${Date.now()}${ext}`;

    // page_count read from the local staged file BEFORE upload (upload moves/unlinks it) —
    // same pattern as createPlanController.
    const kind = documentKindFromExt(ext);
    const pageCount = kind === 'pdf' ? await getPdfPageCount(localFilePath) : null;
    const documentMeta: DocumentMeta = {
      filename: req.file.originalname,
      fileKey: uploadedFileKey,
      kind,
      pageCount,
      byteSize: req.file.size ?? null,
    };

    await storageService.upload(localFilePath, uploadedFileKey);

    const plan = await changePlanDocument(id, req.userId, documentMeta);

    // The AI Examiner's per-plan material cache (gemini.service.ts) must forget the old
    // file now, or a session after this analysis finishes would still read it.
    invalidatePlanMaterial(id);

    // Fire-and-forget — same pattern as createPlanController
    void triggerAnalysis(id).catch((err) =>
      console.error(`[analysis] document-change trigger failed for plan ${id}:`, err)
    );

    res.status(202).json({
      success: true,
      data: { plan, message: 'Document changed, analysis initiated' },
    });
  } catch (error) {
    // Cleanup orphaned files on any error (validation, DB, etc.) — same as createPlanController
    try {
      await fs.promises.access(localFilePath);
      await fs.promises.unlink(localFilePath);
    } catch {
      // File already moved or doesn't exist — no cleanup needed
    }

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
 * POST /api/v1/plans/:id/reanalyze
 * Re-runs analysis over an active plan's document, merging the result into the existing
 * graph so mastery scores survive (SP-05, Issue #170).
 */
export async function reanalyzePlanController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    throw new AppError('Plan ID is required', 400, 'BAD_REQUEST');
  }

  const plan = await reanalyzePlan(id, req.userId);

  // Fire-and-forget — same pattern as createPlanController
  void triggerAnalysis(id).catch((err) =>
    console.error(`[analysis] reanalyze trigger failed for plan ${id}:`, err)
  );

  res.status(202).json({
    success: true,
    data: { plan, message: 'Re-analysis initiated' },
  });
}

/**
 * PATCH /api/v1/plans/:id
 * Archives a plan or restores it to active (SP-04, Issue #171).
 */
export async function updatePlanStatusController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    throw new AppError('Plan ID is required', 400, 'BAD_REQUEST');
  }

  const { status } = updatePlanStatusSchema.parse(req.body);

  const plan = await updatePlanStatus(id, req.userId, status);

  res.status(200).json({
    success: true,
    data: { plan },
  });
}

/**
 * DELETE /api/v1/plans/:id
 * Permanently deletes a study plan and all associated data.
 */
export async function deletePlanController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    throw new AppError('Plan ID is required', 400, 'BAD_REQUEST');
  }

  await deletePlan(id, req.userId);

  res.status(204).send();
}
