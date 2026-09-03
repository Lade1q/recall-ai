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
  addPlanDocuments,
  updatePlanStatus,
  deletePlan,
} from '../services/plan.service';
import {
  createPlanSchema,
  updatePlanStatusSchema,
  planIdParamSchema,
  addPlanDocumentsSchema,
} from '../schemas/plan.schema';
import { createStorageService } from '../services/storage.service';
import { triggerAnalysis } from '../services/analysis.service';
import { invalidatePlanMaterial } from '../services/gemini.service';
import { getPdfPageCount, EncryptedPdfError } from '../utils/pdf';
import { DocumentMeta } from '../types/plan.types';
import { AppError } from '../middleware/errorHandler';
import { STAGING_DIR } from '../middleware/upload.middleware';
import { MAX_FILES_PER_PLAN, MAX_TOTAL_UPLOAD_SIZE } from '../config/upload-limits';

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
 * Every file of one multipart request, whichever field name carried it.
 *
 * The route is `upload.fields([{name:'files'}, {name:'file'}])` rather than `upload.array`, so a
 * client that has not been redeployed yet — and seven backend tests — keep posting `file` and
 * still work. Both fields are read here and treated as one list; a request using both is not an
 * error, it is just a request with more files, and the count check below sees the true total.
 *
 * `req.file` is NOT set by `upload.fields`, so nothing may read it in this flow.
 */
function collectUploadedFiles(req: Request): Express.Multer.File[] {
  const fields = req.files;
  if (!fields || Array.isArray(fields)) return [];
  return [...(fields.files ?? []), ...(fields.file ?? [])];
}

/** Removes staged files that never made it to storage. Best-effort, never throws. */
async function unlinkStagedFiles(paths: readonly string[]): Promise<void> {
  await Promise.all(
    paths.map(async (filePath) => {
      try {
        await fs.promises.access(filePath);
        await fs.promises.unlink(filePath);
      } catch {
        // Already moved or never existed — nothing to clean up.
      }
    })
  );
}

/**
 * POST /api/v1/plans
 * Creates a new StudyPlan and triggers background analysis.
 * Expects multipart/form-data with either file uploads (`files`, or legacy `file`) or a
 * pasted-text `content` field (not both) — plus `name`, `deadline`.
 *
 * One plan now holds a whole subject's worth of documents, and each of them becomes one topic in
 * the graph. A file that fails validation fails the WHOLE request, before anything is written:
 * accepting 4 of 5 would hand the student a plan missing a fifth of their syllabus with nothing
 * on screen saying so. The recovery is cheap — the client keeps the `File[]`, the student removes
 * the offending file and submits again — and every error message names the file it is about,
 * which with five uploads is the difference between an actionable error and a riddle.
 */
export async function createPlanController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const uploadedFiles = collectUploadedFiles(req);

  // Seeded from the staged uploads up front so cleanup (step 7) still fires if Zod validation
  // below throws on a request that *did* stage files.
  let localFilePaths: string[] = uploadedFiles.map((file) => file.path);
  const uploadedFileKeys: string[] = [];

  try {
    // 1. Validate inputs (Zod) trước tiên
    const input = createPlanSchema.parse(req.body);

    if (uploadedFiles.length > 0 && input.content) {
      throw new AppError(
        'Provide either a file upload or pasted content, not both',
        400,
        'CONTENT_OR_FILE_CONFLICT'
      );
    }
    if (uploadedFiles.length === 0 && !input.content) {
      throw new AppError('File or pasted content is required', 400, 'FILE_REQUIRED');
    }
    // Busboy's own `files` limit is deliberately one higher, because the two accepted field
    // names can each be within their own limit while the request as a whole is over. This is
    // the check that actually holds the ceiling.
    if (uploadedFiles.length > MAX_FILES_PER_PLAN) {
      throw new AppError(
        `A plan can hold at most ${MAX_FILES_PER_PLAN} documents (received ${uploadedFiles.length})`,
        400,
        'TOO_MANY_FILES'
      );
    }
    const totalBytes = uploadedFiles.reduce((sum, file) => sum + (file.size ?? 0), 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_SIZE) {
      throw new AppError(
        `Total upload size is ${Math.round(totalBytes / 1024 / 1024)}MB, over the ` +
          `${Math.round(MAX_TOTAL_UPLOAD_SIZE / 1024 / 1024)}MB limit for one plan`,
        400,
        'TOTAL_SIZE_EXCEEDED'
      );
    }

    const sources =
      uploadedFiles.length > 0
        ? uploadedFiles.map((file) => ({
            path: file.path,
            originalname: file.originalname,
            size: file.size,
          }))
        : [stagePastedContent(input.content as string)];
    localFilePaths = sources.map((source) => source.path);

    // 2. Generate uuid cho StudyPlan trước
    const planId = crypto.randomUUID();

    // 3. Thu thập metadata tài liệu. page_count đọc từ file cục bộ TRƯỚC khi upload
    //    (upload sẽ move/unlink file staging). Ném AppError 400 nếu PDF bị mã hoá,
    //    trước khi file được upload hay AnalysisJob được tạo (Issue #223) — và trước khi
    //    BẤT KỲ tệp nào của lô được đưa lên storage, nên một tệp hỏng ở vị trí 3/5 không để
    //    lại hai tệp mồ côi trên storage.
    const documentMetas: DocumentMeta[] = [];
    for (const [index, source] of sources.entries()) {
      const ext = path.extname(source.originalname);
      // `index` keeps the keys distinct when several files are staged inside the same
      // millisecond — `Date.now()` alone collides, and a collision would silently make two
      // documents share one stored file.
      const fileKey = `plans/${planId}/${Date.now()}-${index}${ext}`;
      try {
        documentMetas.push(
          await buildDocumentMeta(source.path, source.originalname, ext, source.size, fileKey)
        );
      } catch (error) {
        // With several files, "this PDF is locked" is not an actionable message unless it says
        // WHICH one.
        if (error instanceof AppError && sources.length > 1) {
          throw new AppError(
            `${source.originalname}: ${error.message}`,
            error.statusCode,
            error.code
          );
        }
        throw error;
      }
    }

    // 4. Upload lên Storage Service ngoài DB transaction
    for (const [index, source] of sources.entries()) {
      const meta = documentMetas[index];
      if (!meta) continue; // unreachable: built one meta per source just above
      await storageService.upload(source.path, meta.fileKey);
      uploadedFileKeys.push(meta.fileKey);
    }

    // 5. Lưu metadata vào DB (plan + documents + analysis job)
    const plan = await createPlanInDb(req.userId, planId, input, documentMetas);

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
    // 7. Cleanup orphaned files on any error (validation, DB, etc.) — EVERY staged file of the
    // batch, not just the one that failed, since the whole request is being rejected.
    await unlinkStagedFiles(localFilePaths);

    // Delete uploaded files from storage if the DB transaction failed after upload
    for (const fileKey of uploadedFileKeys) {
      try {
        await storageService.delete(fileKey);
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

/**
 * POST /api/v1/plans/:id/documents
 *
 * Adds one or more documents to an existing plan and queues the analysis that folds them in
 * (§4). Plural, and deliberately not the same route as the singular `POST /:id/document`, which
 * REPLACES the file of a failed draft.
 *
 * Expects multipart/form-data: `files` (repeatable) and a required `mode` field. The staging /
 * upload / cleanup shape is copied from createPlanController on purpose — the failure modes are
 * identical (a locked PDF at position 3 of 5 must leave nothing behind, on disk or in storage).
 */
export async function addPlanDocumentsController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = planIdParamSchema.parse(req.params);
  const uploadedFiles = collectUploadedFiles(req);

  let localFilePaths: string[] = uploadedFiles.map((file) => file.path);
  const uploadedFileKeys: string[] = [];

  try {
    const { mode } = addPlanDocumentsSchema.parse(req.body);

    if (uploadedFiles.length === 0) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }
    // A per-request ceiling as well as the plan-wide one in the service: this rejects an
    // over-sized request before anything reaches storage, and it is the only check that can
    // still fire when the plan itself is empty.
    if (uploadedFiles.length > MAX_FILES_PER_PLAN) {
      throw new AppError(
        `A plan can hold at most ${MAX_FILES_PER_PLAN} documents (received ${uploadedFiles.length})`,
        400,
        'TOO_MANY_FILES'
      );
    }
    const totalBytes = uploadedFiles.reduce((sum, file) => sum + (file.size ?? 0), 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_SIZE) {
      throw new AppError(
        `Total upload size is ${Math.round(totalBytes / 1024 / 1024)}MB, over the ` +
          `${Math.round(MAX_TOTAL_UPLOAD_SIZE / 1024 / 1024)}MB limit for one plan`,
        400,
        'TOTAL_SIZE_EXCEEDED'
      );
    }

    localFilePaths = uploadedFiles.map((file) => file.path);

    const documentMetas: DocumentMeta[] = [];
    for (const [index, file] of uploadedFiles.entries()) {
      const ext = path.extname(file.originalname);
      const fileKey = `plans/${id}/${Date.now()}-add-${index}${ext}`;
      try {
        documentMetas.push(
          await buildDocumentMeta(file.path, file.originalname, ext, file.size, fileKey)
        );
      } catch (error) {
        if (error instanceof AppError && uploadedFiles.length > 1) {
          throw new AppError(
            `${file.originalname}: ${error.message}`,
            error.statusCode,
            error.code
          );
        }
        throw error;
      }
    }

    for (const [index, meta] of documentMetas.entries()) {
      const source = uploadedFiles[index];
      if (!source) continue; // unreachable: built one meta per uploaded file just above
      await storageService.upload(source.path, meta.fileKey);
      uploadedFileKeys.push(meta.fileKey);
    }

    const plan = await addPlanDocuments(id, req.userId, documentMetas, mode);

    // The AI Examiner caches the plan's material for 12h; a session started after this analysis
    // finishes would otherwise still be quizzing from the file set as it was before.
    invalidatePlanMaterial(id);

    void triggerAnalysis(id).catch((err) =>
      console.error(`[analysis] add-documents trigger failed for plan ${id}:`, err)
    );

    res.status(202).json({
      success: true,
      data: { plan, message: 'Documents added, analysis initiated' },
    });
  } catch (error) {
    await unlinkStagedFiles(localFilePaths);

    for (const fileKey of uploadedFileKeys) {
      try {
        await storageService.delete(fileKey);
      } catch (err) {
        console.error('Failed to delete uploaded file key from storage:', err);
      }
    }

    throw error;
  }
}
