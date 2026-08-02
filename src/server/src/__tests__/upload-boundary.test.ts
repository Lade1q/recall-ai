import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { upload, enforceFileSizeLimit } from '../middleware/upload.middleware';
import { errorHandler } from '../middleware/errorHandler';

// Giới hạn nghiệp vụ là inclusive: file đúng 10MB (10 * 1024 * 1024 bytes) phải được
// chấp nhận. Test này bao 3 mốc boundary quanh giới hạn để chống regression cho bug
// off-by-one của busboy (so sánh `fileSize === fileSizeLimit`).
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STAGING_DIR = path.resolve(process.cwd(), 'uploads', '.staging');

function buildTestApp() {
  const app = express();
  app.post('/upload', upload.single('file'), enforceFileSizeLimit, (req, res) => {
    res.status(200).json({ size: req.file?.size ?? null });
  });
  app.use(errorHandler);
  return app;
}

function listStagingFiles(): string[] {
  if (!fs.existsSync(STAGING_DIR)) return [];
  return fs.readdirSync(STAGING_DIR);
}

describe('upload boundary — giới hạn 10MB inclusive', () => {
  const app = buildTestApp();

  it('chấp nhận file 10MB - 1 byte', async () => {
    const buffer = Buffer.alloc(MAX_FILE_SIZE - 1, 'a');
    const res = await request(app)
      .post('/upload')
      .attach('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.size).toBe(MAX_FILE_SIZE - 1);
  });

  it('chấp nhận file đúng bằng 10MB (case chính của bug)', async () => {
    const buffer = Buffer.alloc(MAX_FILE_SIZE, 'a');
    const res = await request(app)
      .post('/upload')
      .attach('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.size).toBe(MAX_FILE_SIZE);
  });

  it('từ chối file 10MB + 1 byte và dọn file tạm', async () => {
    const before = new Set(listStagingFiles());
    const buffer = Buffer.alloc(MAX_FILE_SIZE + 1, 'a');
    const res = await request(app)
      .post('/upload')
      .attach('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');

    const after = listStagingFiles().filter((f) => !before.has(f));
    expect(after).toEqual([]);
  });

  it('từ chối file lớn hơn hẳn giới hạn (qua nhánh MulterError sẵn có)', async () => {
    const buffer = Buffer.alloc(MAX_FILE_SIZE * 2, 'a');
    const res = await request(app)
      .post('/upload')
      .attach('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });
});
