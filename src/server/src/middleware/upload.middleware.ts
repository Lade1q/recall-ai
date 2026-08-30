import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError } from './errorHandler';

// Temporary staging directory — files are moved to final storage by StorageService.
// Exported so createPlanController can stage pasted text (UC-02 A3) the same way multer
// stages an uploaded file, and reuse the same cleanup-on-error path.
export const STAGING_DIR = path.resolve(process.cwd(), 'uploads', '.staging');

if (!fs.existsSync(STAGING_DIR)) {
  fs.mkdirSync(STAGING_DIR, { recursive: true });
}

const ALLOWED_MIMES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit (inclusive)

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
  limits: { fileSize: MAX_FILE_SIZE + 1 },
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
