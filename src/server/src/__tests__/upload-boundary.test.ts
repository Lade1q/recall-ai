import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { upload, MAX_FILE_SIZE } from '../middleware/upload.middleware';
import { errorHandler } from '../middleware/errorHandler';

// Giới hạn nghiệp vụ là inclusive: file đúng 10MB (MAX_FILE_SIZE bytes) phải được
// chấp nhận. Suite này bao các mốc boundary quanh giới hạn để chống regression cho
// bug off-by-one của busboy (#195): busboy bắn `LIMIT_FILE_SIZE` khi
// `fileSize === fileSizeLimit`, nên middleware đặt limit = MAX_FILE_SIZE + 1.
const STAGING_DIR = path.resolve(process.cwd(), 'uploads', '.staging');

function buildTestApp() {
  const app = express();
  app.post('/upload', upload.single('file'), (req, res) => {
    res
      .status(200)
      .json({ size: req.file?.size ?? null, originalname: req.file?.originalname ?? null });
  });
  app.use(errorHandler);
  return app;
}

function listStagingFiles(): string[] {
  if (!fs.existsSync(STAGING_DIR)) return [];
  return fs.readdirSync(STAGING_DIR);
}

// `.staging` is shared by every jest worker: STAGING_DIR resolves from process.cwd()
// (upload.middleware.ts:9), and plan.controller.ts:98 stages pasted text under the SAME
// `${Date.now()}-${random}.txt` shape multer uses. So "no NEW file appeared" also catches
// another suite's staging file — that, not a multer race, is what makes this flake (#427).
// multer's unlink always finishes before the response: its callback is what calls done()
// (measured 0/1560 completions after the response). Longest foreign-file lifetime observed:
// 323ms across 3 full-suite runs, 0 above 1s. Poll up to 2s (~6x) instead of reading
// instantly; a real leak still fails fast, and a >2s straggler still fails rather than
// being waited out forever.
async function waitForNoNewStagingFiles(before: Set<string>, timeoutMs = 2000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let after: string[];
  do {
    after = listStagingFiles().filter((f) => !before.has(f));
    if (after.length === 0) return after;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  return after;
}

describe('upload boundary — giới hạn 10MB inclusive', () => {
  const app = buildTestApp();
  // File được chấp nhận sẽ nằm lại trong .staging (route thật do StorageService dọn).
  // Trong test không có bước đó nên tự xoá các file phát sinh để tránh rác tích luỹ.
  let preexisting: Set<string>;

  beforeAll(() => {
    preexisting = new Set(listStagingFiles());
  });

  afterAll(() => {
    for (const f of listStagingFiles()) {
      if (!preexisting.has(f)) fs.rmSync(path.join(STAGING_DIR, f), { force: true });
    }
  });

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

  it('từ chối file 10MB + 1 byte và không để lại file tạm', async () => {
    const before = new Set(listStagingFiles());
    const buffer = Buffer.alloc(MAX_FILE_SIZE + 1, 'a');
    const res = await request(app)
      .post('/upload')
      .attach('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

    // busboy abort ngay tại mốc limit → MulterError LIMIT_FILE_SIZE, và multer tự xoá file đã
    // ghi dở XONG rồi mới trả response. File "mới" bắt được ở đây là của suite khác đang dùng
    // chung `.staging` — chờ nó tự dọn (#427).
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');

    const after = await waitForNoNewStagingFiles(before);
    expect(after).toEqual([]);
  });

  // #375: đỏ ngẫu nhiên trong full suite (không phải khi chạy riêng) — nạp 20MB buffer thật
  // thỉnh thoảng không kịp timeout mặc định 5s dưới tải CPU (ts-jest biên dịch nguội, nhiều
  // suite chạy song song). Nâng timeout riêng ca này, KHÔNG đụng testTimeout toàn cục — nới lỏng
  // cổng cho mọi test khác là đúng hướng ngược lại với thứ cần.
  it('từ chối file lớn hơn hẳn giới hạn', async () => {
    const buffer = Buffer.alloc(MAX_FILE_SIZE * 2, 'a');
    const res = await request(app)
      .post('/upload')
      .attach('file', buffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  }, 20_000);
});

// Busboy defaults to decoding non-extended Content-Disposition filename params as latin1,
// mangling UTF-8 filenames into mojibake before they reach the controller. multer's
// `defParamCharset: 'utf8'` fixes this at the source, so a name never gets persisted
// broken to Document.filename.
describe('upload filename encoding — tên file tiếng Việt không bị mojibake', () => {
  const app = buildTestApp();
  let preexisting: Set<string>;

  beforeAll(() => {
    preexisting = new Set(listStagingFiles());
  });

  afterAll(() => {
    for (const f of listStagingFiles()) {
      if (!preexisting.has(f)) fs.rmSync(path.join(STAGING_DIR, f), { force: true });
    }
  });

  it('giữ nguyên UTF-8 cho tên file có dấu tiếng Việt', async () => {
    const res = await request(app).post('/upload').attach('file', Buffer.from('nội dung'), {
      filename: 'ngăn-xếp.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(200);
    expect(res.body.originalname).toBe('ngăn-xếp.txt');
  });
});
