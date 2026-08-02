import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Temporary staging directory — files are moved to final storage by StorageService
const STAGING_DIR = path.resolve(process.cwd(), 'uploads', '.staging');

if (!fs.existsSync(STAGING_DIR)) {
  fs.mkdirSync(STAGING_DIR, { recursive: true });
}

const ALLOWED_MIMES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

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
 * Restricts files to PDF, TXT, PNG, and JPG up to 10MB.
 *
 * `limits.fileSize` được cấu hình dư 1 byte (MAX_FILE_SIZE + 1) vì busboy so sánh
 * `fileSize === fileSizeLimit` để đánh dấu stream "truncated", nên nếu đặt đúng
 * MAX_FILE_SIZE thì một file có kích thước CHÍNH XÁC 10MB cũng bị coi là vượt giới
 * hạn và bị abort oan. Việc từ chối file thực sự > 10MB do `enforceFileSizeLimit`
 * đảm nhiệm sau khi file đã được ghi xong.
 */
export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE + 1 },
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

/**
 * Từ chối file có kích thước thực tế vượt quá MAX_FILE_SIZE (giới hạn 10MB là inclusive,
 * tức size == MAX_FILE_SIZE vẫn hợp lệ). Phải đặt sau `upload.single()`/`upload.array()`
 * trong route vì cần `req.file` đã được multer gắn vào.
 */
export function enforceFileSizeLimit(req: Request, _res: Response, next: NextFunction): void {
  if (req.file && req.file.size > MAX_FILE_SIZE) {
    fs.unlink(req.file.path, () => {
      next(new AppError('File size exceeds maximum limit of 10MB', 400, 'FILE_TOO_LARGE'));
    });
    return;
  }
  next();
}
