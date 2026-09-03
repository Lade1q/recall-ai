import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { upload, STAGING_DIR } from '../middleware/upload.middleware';
import { MAX_FILES_PER_PLAN } from '../config/upload-limits';
import { errorHandler } from '../middleware/errorHandler';

/**
 * The route accepts files under TWO field names — `files` for the current client and `file` for
 * one that has not been redeployed — which is what `upload.fields` buys and `upload.array` does
 * not. That convenience creates two traps this suite pins:
 *
 *  1. Each field can be inside its own `maxCount` while the request as a whole is over the plan's
 *     ceiling. Only the controller sees both at once, so only the controller can hold the limit.
 *  2. Overflowing a single field raises `LIMIT_UNEXPECTED_FILE`, not `LIMIT_FILE_COUNT`, unless
 *     `limits.files` is set — and `LIMIT_UNEXPECTED_FILE` also means "field name I don't know",
 *     so mapping it to TOO_MANY_FILES would mislabel exactly the old-client case.
 */
function buildTestApp() {
  const app = express();
  app.post(
    '/upload',
    upload.fields([
      { name: 'files', maxCount: MAX_FILES_PER_PLAN },
      { name: 'file', maxCount: 1 },
    ]),
    (req, res) => {
      const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
      res.status(200).json({
        files: fields?.files?.length ?? 0,
        file: fields?.file?.length ?? 0,
      });
    }
  );
  app.use(errorHandler);
  return app;
}

function listStagingFiles(): string[] {
  if (!fs.existsSync(STAGING_DIR)) return [];
  return fs.readdirSync(STAGING_DIR);
}

describe('multi-file upload boundaries', () => {
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

  it(`accepts ${MAX_FILES_PER_PLAN} files in one request`, async () => {
    let req = request(app).post('/upload');
    for (let i = 0; i < MAX_FILES_PER_PLAN; i++) {
      req = req.attach('files', Buffer.from(`doc ${i}`), {
        filename: `doc-${i}.txt`,
        contentType: 'text/plain',
      });
    }

    const res = await req;

    expect(res.status).toBe(200);
    expect(res.body.files).toBe(MAX_FILES_PER_PLAN);
  });

  it('answers TOO_MANY_FILES — not the generic UPLOAD_ERROR — when one field overflows', async () => {
    // Measured 2026-09-03: this is LIMIT_UNEXPECTED_FILE with `field: "files"`, NOT
    // LIMIT_FILE_COUNT — multer reaches the field's `maxCount` before busboy's global count.
    let req = request(app).post('/upload');
    for (let i = 0; i < MAX_FILES_PER_PLAN + 2; i++) {
      req = req.attach('files', Buffer.from(`doc ${i}`), {
        filename: `doc-${i}.txt`,
        contentType: 'text/plain',
      });
    }

    const res = await req;

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_FILES');
  });

  it('still accepts a single file posted under the OLD field name', async () => {
    const res = await request(app).post('/upload').attach('file', Buffer.from('legacy'), {
      filename: 'legacy.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(200);
    expect(res.body.file).toBe(1);
  });

  it('lets multer through when each field is within its own limit — the controller holds the real ceiling', async () => {
    let req = request(app).post('/upload');
    for (let i = 0; i < MAX_FILES_PER_PLAN; i++) {
      req = req.attach('files', Buffer.from(`doc ${i}`), {
        filename: `doc-${i}.txt`,
        contentType: 'text/plain',
      });
    }
    req = req.attach('file', Buffer.from('one more'), {
      filename: 'extra.txt',
      contentType: 'text/plain',
    });

    const res = await req;

    // 8 + 1 = 9 files, and multer is happy: neither field broke its own maxCount. This is the
    // request the controller's own count check exists for.
    expect(res.status).toBe(200);
    expect(res.body.files + res.body.file).toBe(MAX_FILES_PER_PLAN + 1);
  });

  // Same multer code as the case above, told apart only by `err.field`. This is the pair: if the
  // handler ever maps LIMIT_UNEXPECTED_FILE wholesale, one of these two turns red.
  it('rejects an unknown field name as UPLOAD_ERROR, not as TOO_MANY_FILES', async () => {
    const res = await request(app).post('/upload').attach('attachment', Buffer.from('x'), {
      filename: 'x.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPLOAD_ERROR');
  });
});
