import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError } from './errorHandler';
import { MAX_FILE_SIZE, MAX_FILES_PER_PLAN, MAX_TOTAL_UPLOAD_SIZE } from '../config/upload-limits';

// Temporary staging directory — files are moved to final storage by StorageService.
// Exported so createPlanController can stage pasted text (UC-02 A3) the same way multer
// stages an uploaded file, and reuse the same cleanup-on-error path.
const stagingRoot = path.resolve(process.cwd(), 'uploads', '.staging');
const jestWorkerId = process.env.JEST_WORKER_ID;
// Jest assigns a positive integer to every worker. Keeping each worker below its own directory
// prevents one suite from mistaking another worker's in-flight upload for a leaked file (#447).
// Outside Jest the environment variable is absent, so production keeps the original path.
// `jestWorkerId &&` is not a redundant truthiness check in front of the regex: it narrows
// `string | undefined` down to `string` for the `path.join` below. Dropping it is TS2345, and
// seven suites then fail to compile — the suite total falls from 993 to 957 (c22a826) rather
// than one assertion turning red, so it is easy to "clean up" and not notice.
export const STAGING_DIR =
  jestWorkerId && /^[1-9]\d*$/.test(jestWorkerId)
    ? path.join(stagingRoot, jestWorkerId)
    : stagingRoot;

if (!fs.existsSync(STAGING_DIR)) {
  fs.mkdirSync(STAGING_DIR, { recursive: true });
}

const ALLOWED_MIMES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'];

// Re-exported so the many existing importers of `MAX_FILE_SIZE` from this module keep working.
export { MAX_FILE_SIZE, MAX_FILES_PER_PLAN, MAX_TOTAL_UPLOAD_SIZE };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, STAGING_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

/**
 * Multer middleware configured for file uploads.
 * Restricts files to PDF, TXT, PNG, and JPG up to 10MB (inclusive).
 *
 * `limits.fileSize` đặt dư 1 byte (MAX_FILE_SIZE + 1) vì busboy đánh dấu stream
 * "truncated" và bắn `LIMIT_FILE_SIZE` ngay khi `fileSize === fileSizeLimit`. Nếu
 * đặt đúng MAX_FILE_SIZE thì file có kích thước CHÍNH XÁC 10MB cũng bị từ chối oan
 * (bug #195). Với limit MAX_FILE_SIZE + 1, file <= 10MB được chấp nhận, còn file
 * > 10MB (tức >= MAX_FILE_SIZE + 1 bytes) vẫn bị busboy abort sớm và trả về
 * FILE_TOO_LARGE qua errorHandler — không cần kiểm tra kích thước thủ công sau upload.
 */
export const upload = multer({
  storage,
  // `files` is MAX_FILES_PER_PLAN + 1 for the same reason `fileSize` is MAX_FILE_SIZE + 1: the
  // route accepts the files under two field names (`files` for the current client, `file` for the
  // old single-file one), so a legitimate request can carry 8 in one plus 1 in the other. The
  // exact ceiling is enforced in the controller, which can see both fields at once; busboy's job
  // here is only to stop a request that is trying to flood the disk.
  //
  // Without a `files` limit the 9th file raises LIMIT_UNEXPECTED_FILE, not LIMIT_FILE_COUNT —
  // and LIMIT_UNEXPECTED_FILE also means "field name I was not told about", so mapping THAT to
  // TOO_MANY_FILES would mislabel exactly the old-client case `upload.fields` exists to rescue.
  limits: { fileSize: MAX_FILE_SIZE + 1, files: MAX_FILES_PER_PLAN + 1 },
  // Busboy decodes non-extended Content-Disposition filename params (i.e. `filename=`,
  // as modern browsers send it) as latin1 by default, mangling UTF-8 filenames like
  // "ngăn-xếp.txt" into mojibake before it ever reaches the controller.
  defParamCharset: 'utf8',
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          'File format not allowed. Accepted: .pdf, .txt, .png, .jpg',
          400,
          'INVALID_FILE_TYPE'
        )
      );
    }
  },
});
