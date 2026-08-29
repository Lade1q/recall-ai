import fs from 'fs';
import path from 'path';
import { resolveMaterialText } from '../services/analysis.service';
import { UPLOAD_DIR } from '../utils/material';

// analysis.service.ts imports these at module load — mocked so importing it here does not
// instantiate the real `GoogleGenAI` client (which warns about a missing API key otherwise).
// `resolveMaterialText` itself never calls either.
jest.mock('../services/gemini.service', () => ({
  extractConcepts: jest.fn(),
  uploadFile: jest.fn(),
}));
jest.mock('../services/graph.service', () => ({
  validateDAG: jest.fn(),
}));

/**
 * Review #425 round 2 (Quân) — `resolveMaterialText` had no direct test at all; the only
 * coverage was indirect, through `USE_MOCK_AI=true` runs where it always short-circuits to
 * `null` before ever touching disk. Real files under `UPLOAD_DIR`, not mocks: the function's
 * whole job is deciding WHETHER to touch disk (mock mode / material kind) and what a real read
 * failure degrades to, and a jest.fn() standing in for `fs` would prove none of that.
 */
describe('resolveMaterialText', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;
  let tmpFiles: string[] = [];

  function writeTempFile(ext: string, content: string): string {
    const fileKey = `resolve-material-text-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, fileKey), content, 'utf-8');
    tmpFiles.push(fileKey);
    return fileKey;
  }

  beforeEach(() => {
    process.env.USE_MOCK_AI = 'false';
    tmpFiles = [];
  });

  afterEach(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
    for (const fileKey of tmpFiles) {
      fs.rmSync(path.join(UPLOAD_DIR, fileKey), { force: true });
    }
  });

  it('.txt — returns the real file content', async () => {
    const fileKey = writeTempFile('.txt', '4.2 Ngăn xếp\n\nA stack follows LIFO order.');

    const text = await resolveMaterialText(fileKey);

    expect(text).toBe('4.2 Ngăn xếp\n\nA stack follows LIFO order.');
  });

  it('.pdf — returns null without ever touching the filesystem', async () => {
    // Never written to disk anywhere — if this function tried to read it, the test would fail
    // on ENOENT rather than silently passing for the wrong reason.
    const text = await resolveMaterialText('plans/some-plan/never-written.pdf');

    expect(text).toBeNull();
  });

  it('USE_MOCK_AI=true — returns null even for a real, readable .txt file', async () => {
    const fileKey = writeTempFile('.txt', 'this content must not be read in mock mode');
    process.env.USE_MOCK_AI = 'true';

    const text = await resolveMaterialText(fileKey);

    expect(text).toBeNull();
  });

  /**
   * The blocker review round 2 chặn: a disk read failure (file vanished between upload and
   * analysis — this repo has precedent, #411) must degrade to `null`, the guard's own "cannot
   * verify" answer, rather than throw and fail the whole analysis job outside `callAiWithRetry`'s
   * retry loop.
   */
  it('.txt file missing from disk — degrades to null instead of throwing', async () => {
    const fileKey = `resolve-material-text-missing-${Date.now()}.txt`;

    await expect(resolveMaterialText(fileKey)).resolves.toBeNull();
  });
});
