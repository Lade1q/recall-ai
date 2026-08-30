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
import {
  createPlanSchema,
  updatePlanStatusSchema,
  planIdParamSchema,
} from '../schemas/plan.schema';
import { createStorageService } from '../services/storage.service';
import { triggerAnalysis } from '../services/analysis.service';
import { invalidatePlanMaterial } from '../services/gemini.service';
import { getPdfPageCount, EncryptedPdfError } from '../utils/pdf';
import { DocumentMeta } from '../types/plan.types';
import { AppError } from '../middleware/errorHandler';
import { STAGING_DIR } from '../middleware/upload.middleware';

const storageService = createStorageService();

/** Maps an uploaded file's extension to a DocumentKind (SP-01 accepts pdf/image/text). */
function documentKindFromExt(ext: string): DocumentKind {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.png' || e === '.jpg' || e === '.jpeg') return 'image';
  return 'text';
}

/**
 * Builds Document metadata for a freshly staged upload — reads local-file details (page
 * count) before the file is moved to storage. Shared by createPlanController and
 * changePlanDocumentController, the two entry points that stage a file and are about to
 * create an AnalysisJob for it.
 *
 * @throws AppError(400, 'ENCRYPTED_PDF') for a PDF with an `/Encrypt` dictionary (Issue
 * #223) — Gemini's File API can't read such a file, and letting the job run would burn
 * `MAX_ATTEMPTS` wasted Gemini calls (~20s) before failing anyway. Caught here, before the
 * file is uploaded to storage or any DB row is created.
 */
async function buildDocumentMeta(
  localFilePath: string,
  originalname: string,
  ext: string,
  size: number | undefined,
  fileKey: string
): Promise<DocumentMeta> {
  const kind = documentKindFromExt(ext);

  let pageCount: number | null = null;
  if (kind === 'pdf') {
    try {
      pageCount = await getPdfPageCount(localFilePath);
    } catch (error) {
      if (error instanceof EncryptedPdfError) {
        throw new AppError(
          'This PDF is password-protected or has security restrictions and cannot be analyzed. Please remove the password/restrictions and upload again.',
          400,
          'ENCRYPTED_PDF'
        );
      }
      throw error;
    }
  }

  return {
    filename: originalname,
    fileKey,
    kind,
    pageCount,
    byteSize: size ?? null,
  };
}

/**
 * Stages pasted text (UC-02 A3, "Dán text") as a `.txt` file in the same staging dir
 * multer uses for uploads, so the rest of createPlanController — buildDocumentMeta,
 * storageService.upload, cleanup-on-error — treats it exactly like an uploaded file.
 * `documentKindFromExt('.txt')` resolves this to `kind: 'text'`, which the existing
 * analysis pipeline (`resolveMaterialSource`, inline `extractConcepts({kind:'text'})`)
 * already knows how to read — nothing downstream needs to change for this source.
 */
function stagePastedContent(content: string): {
  path: string;
  originalname: string;
  size: number;
} {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const filePath = path.join(STAGING_DIR, `${uniqueSuffix}.txt`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return {
    path: filePath,
    originalname: 'pasted-text.txt',
    size: Buffer.byteLength(content, 'utf-8'),
  };
}

/**
 * POST /api/v1/plans
 * Creates a new StudyPlan and triggers background analysis.
 * Expects multipart/form-data with either a `file` upload or a pasted-text `content`
 * field (not both) — plus `name`, `deadline`.
 */
export async function createPlanController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  // Set from `req.file` up front so cleanup (step 7) still fires if Zod validation
  // below throws on a request that *did* stage a multer file.
  let localFilePath: string | null = req.file?.path ?? null;
  let uploadedFileKey: string | null = null;

  try {
    // 1. Validate inputs (Zod) trước tiên
    const input = createPlanSchema.parse(req.body);

    if (req.file && input.content) {
      throw new AppError(
        'Provide either a file upload or pasted content, not both',
        400,
        'CONTENT_OR_FILE_CONFLICT'
      );
    }
    if (!req.file && !input.content) {
      throw new AppError('File or pasted content is required', 400, 'FILE_REQUIRED');
    }

    const source = req.file
      ? { path: req.file.path, originalname: req.file.originalname, size: req.file.size }
      : stagePastedContent(input.content as string);
    localFilePath = source.path;

    // 2. Generate uuid cho StudyPlan trước
    const planId = crypto.randomUUID();
    const ext = path.extname(source.originalname);
    uploadedFileKey = `plans/${planId}/${Date.now()}${ext}`;

    // 3. Thu thập metadata tài liệu. page_count đọc từ file cục bộ TRƯỚC khi upload
    //    (upload sẽ move/unlink file staging). Ném AppError 400 nếu PDF bị mã hoá,
    //    trước khi file được upload hay AnalysisJob được tạo (Issue #223).
    const documentMeta = await buildDocumentMeta(
      localFilePath,
      source.originalname,
      ext,
      source.size,
      uploadedFileKey
    );

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
    if (localFilePath) {
      try {
        await fs.promises.access(localFilePath);
        await fs.promises.unlink(localFilePath);
      } catch {
        // File already moved or doesn't exist — no cleanup needed
      }
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

  const { id } = planIdParamSchema.parse(req.params);

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

  const { id } = planIdParamSchema.parse(req.params);

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

  const { id } = planIdParamSchema.parse(req.params);

  if (!req.file) {
    throw new AppError('File is required', 400, 'FILE_REQUIRED');
  }

  const localFilePath = req.file.path;
  let uploadedFileKey: string | null = null;

  try {
    const ext = path.extname(req.file.originalname);
    uploadedFileKey = `plans/${id}/${Date.now()}${ext}`;

    // page_count read from the local staged file BEFORE upload (upload moves/unlinks it) —
    // same pattern as createPlanController, including the encrypted-PDF guard.
    const documentMeta = await buildDocumentMeta(
      localFilePath,
      req.file.originalname,
      ext,
      req.file.size,
      uploadedFileKey
    );

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

  const { id } = planIdParamSchema.parse(req.params);

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

  const { id } = planIdParamSchema.parse(req.params);

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

  const { id } = planIdParamSchema.parse(req.params);

  await deletePlan(id, req.userId);

  res.status(204).send();
}
