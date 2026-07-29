import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

/**
 * Best-effort page count for a PDF at `absolutePath`. Returns null on any failure
 * (corrupt/encrypted file, parse error) — `documents.page_count` is optional metadata
 * for the pager UI and must never block plan creation. Only call this for PDFs; other
 * document kinds have no page structure.
 */
export async function getPdfPageCount(absolutePath: string): Promise<number | null> {
  try {
    const bytes = await fs.promises.readFile(absolutePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null;
  }
}
