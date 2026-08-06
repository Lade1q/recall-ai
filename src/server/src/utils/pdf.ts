import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

/**
 * Thrown when a PDF carries an `/Encrypt` dictionary. Such a file can open fine in an
 * ordinary reader — an owner password may only restrict printing/copying, with no password
 * needed to view — but Gemini's File API cannot read the (encrypted) content streams and
 * rejects it with "The document has no pages" only after `analysis.service.ts` has already
 * burned `MAX_ATTEMPTS` calls on it (Issue #223). Callers should surface this at upload time,
 * before an AnalysisJob is ever created.
 */
export class EncryptedPdfError extends Error {
  constructor() {
    super('PDF file is encrypted');
    this.name = 'EncryptedPdfError';
  }
}

/**
 * Best-effort page count for a PDF at `absolutePath`.
 *
 * @throws EncryptedPdfError if the PDF has an `/Encrypt` dictionary.
 * Returns null for any other read/parse failure (corrupt file) — `documents.page_count` is
 * optional metadata for the pager UI and must never block plan creation for reasons other
 * than encryption. Only call this for PDFs; other document kinds have no page structure.
 */
export async function getPdfPageCount(absolutePath: string): Promise<number | null> {
  try {
    const bytes = await fs.promises.readFile(absolutePath);
    // `ignoreEncryption: true` so `load()` itself never throws for this — an `/Encrypt`
    // dict only opaques string/stream content, not the page tree, so `isEncrypted` and the
    // page count are both readable regardless. Checked via `isEncrypted` rather than
    // catching pdf-lib's own EncryptedPDFError: that class's `instanceof` check is broken
    // by a transpilation quirk in pdf-lib's own build (its `Error` subclasses don't survive
    // `Error.call(this, msg)` under V8), so it never matches here.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (doc.isEncrypted) {
      throw new EncryptedPdfError();
    }
    return doc.getPageCount();
  } catch (error) {
    if (error instanceof EncryptedPdfError) {
      throw error;
    }
    return null;
  }
}
