import path from 'path';
import type { DocumentKind } from '@prisma/client';

/**
 * The two response headers that decide what the browser *does* with a stored document when it
 * is served back for deep C5 verification (Issue #203, "Mở tài liệu tại trang N"): render it in
 * place, or download it as an opaque blob.
 *
 * Pure: string mapping only, no filesystem and no database, so both rules stay provable with the
 * DB and the API key switched off (SDP risk R05).
 *
 * Deliberately separate from `resolveMaterialSource` (`material.ts`), which answers a different
 * question — how to hand a file to Gemini — and is allowed to *throw* on an extension the model
 * cannot take. Serving must never throw: an unrecognised file still has to come back with some
 * content type rather than 500 a page the student is trying to check.
 */

/** `kind: 'image'` does not say *which* image, so those fall through to the extension. */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * What to send as `Content-Type`. `kind` wins where it is decisive because it was recorded from
 * the upload's own MIME type (`upload.middleware`), which is stronger evidence than a filename
 * the student chose.
 *
 * `charset=utf-8` on text is not optional: pasted material is written as UTF-8, and without the
 * charset a browser falls back to a locale default and renders Vietnamese as mojibake — which
 * looks exactly like the AI having cited nonsense.
 */
export function resolveDocumentContentType(kind: DocumentKind, filename: string): string {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'text') return 'text/plain; charset=utf-8';

  const ext = path.extname(filename).toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * `Content-Disposition: inline` — the point of this endpoint is to *show* the page, not to make
 * the student find the file in their downloads folder.
 *
 * The filename has to be sent twice. Node rejects a header value containing anything outside
 * Latin-1 (`ERR_INVALID_CHAR`), and real filenames here are Vietnamese ("Giải thuật — Chương 4:
 * Đồ thị.pdf"), so the plain `filename=` parameter carries an ASCII-only fallback and `filename*`
 * carries the true name percent-encoded per RFC 5987. Quotes and backslashes are stripped rather
 * than escaped so the fallback cannot break out of its own quoted-string.
 */
export function buildContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  const safeFallback = asciiFallback.trim() || 'document';

  return `inline; filename="${safeFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
