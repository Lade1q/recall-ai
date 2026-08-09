import { Request, Response } from 'express';
import { getPlanDocumentFile } from '../services/document.service';
import { planDocumentParamsSchema } from '../schemas/plan.schema';
import { buildContentDisposition, resolveDocumentContentType } from '../utils/document-file';
import { AppError } from '../middleware/errorHandler';

/**
 * GET /api/v1/plans/:id/documents/:documentId
 * The original uploaded file, served inline so a student can open the page a concept was
 * extracted from and check it against the excerpt (Issue #203, constraint C5).
 *
 * The only route in the app that answers with bytes instead of the `{ success, data }`
 * envelope — the response *is* the document. Errors still go through `errorHandler` and keep
 * the envelope, so a failure is never mistaken for a zero-byte file.
 */
export async function getPlanDocumentFileController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  // mergeParams on the router makes `id` (the plan) visible alongside `documentId`. Both are
  // @db.Uuid — validate before touching Prisma or a malformed id throws an unmapped P2023 and
  // falls through to 500 instead of 400 (the bug PR #191 fixed for the other /plans routes).
  const { id, documentId } = planDocumentParamsSchema.parse(req.params);

  const document = await getPlanDocumentFile(id, documentId, req.userId);

  res.setHeader('Content-Type', resolveDocumentContentType(document.kind, document.filename));
  res.setHeader('Content-Disposition', buildContentDisposition(document.filename));
  res.setHeader('Content-Length', document.bytes.length);
  // Serving a student's own upload inline: pin the declared Content-Type so a browser can't
  // sniff a mislabelled file into something executable. helmet() already sets this globally,
  // but this endpoint is the one that hands back raw user bytes — it should not depend on
  // middleware ordering staying the way it is today.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Private, not public: this URL is the same for everyone but its *contents* are one student's
  // upload, and a shared cache must never hand them to the next request bearing another token.
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

  res.status(200).send(document.bytes);
}
