import path from 'path';

/**
 * How an uploaded file is handed to Gemini, decided from its extension alone.
 *
 * Shared by the two callers that send a student's own document to the model — `extract_concepts`
 * during analysis (I3.2) and `generate_question` / `grade_answer` during an interview (I6.3) —
 * so a newly supported upload type is taught to both at once.
 *
 * Pure: mapping only, no filesystem and no API call, so it stays testable with the DB and the
 * API key switched off (SDP risk R05).
 */

/** Where uploads live on disk. MVP local storage — see `storage.service.ts`. */
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** `text` is inlined into the prompt; the others go through the File API by URI. */
export type MaterialSource = { kind: 'text' } | { kind: 'document' | 'image'; mimeType: string };

/** @throws Error when the extension is one the AI calls cannot take. */
export function resolveMaterialSource(fileKey: string): MaterialSource {
  const ext = path.extname(fileKey).toLowerCase();

  if (ext === '.txt') {
    return { kind: 'text' };
  }

  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    throw new Error(`Unsupported file extension for AI extraction: ${ext}`);
  }

  return { kind: mimeType === 'application/pdf' ? 'document' : 'image', mimeType };
}
