import type { DocumentKind } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { createStorageService } from './storage.service';

const storageService = createStorageService();

/** One stored document, ready to be written to the response. */
export interface PlanDocumentFile {
  filename: string;
  kind: DocumentKind;
  bytes: Buffer;
}

/**
 * Serves the original file behind a plan's document (Issue #203) — the second, deeper half of
 * constraint C5: #202 lets a student read the *excerpt* the AI extracted a concept from, this
 * lets them open the document itself and check that the excerpt is really on that page.
 *
 * Ownership is checked through the plan, exactly like `getConceptDetail`, but the failure is
 * reported differently on purpose. `getConceptDetail` answers 403 for someone else's plan; here
 * every miss — no such document, right document but wrong plan, right plan but wrong owner —
 * collapses into one 404 with one message. A 403 confirms "this id exists, it just isn't yours",
 * and for raw uploaded material that existence is itself worth hiding. It also means the three
 * cases cannot be told apart by timing or wording, which is why they share a single query.
 */
export async function getPlanDocumentFile(
  planId: string,
  documentId: string,
  userId: string
): Promise<PlanDocumentFile> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, planId, plan: { userId } },
    select: { filename: true, kind: true, fileKey: true },
  });

  if (!document) {
    throw new AppError('Document not found', 404, 'NOT_FOUND');
  }

  const bytes = await storageService.read(document.fileKey);

  // The row can outlive the object it names — a `documents` row survives a manual `uploads/`
  // cleanup, and SP-04 change-document rewrites `fileKey` in place. Answering 404 rather than
  // 500 says the true thing: ownership was fine, there is simply no file left to show.
  if (!bytes) {
    throw new AppError('Document file is no longer available', 404, 'DOCUMENT_FILE_MISSING');
  }

  return { filename: document.filename, kind: document.kind, bytes };
}
