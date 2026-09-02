import fs from 'fs';
import path from 'path';

const originalWorkerId = process.env.JEST_WORKER_ID;
const testWorkerIds = ['447001', '447002'] as const;

async function loadStagingDirectory(workerId: string | undefined): Promise<string> {
  if (workerId === undefined) {
    delete process.env.JEST_WORKER_ID;
  } else {
    process.env.JEST_WORKER_ID = workerId;
  }
  jest.resetModules();
  return (await import('../middleware/upload.middleware')).STAGING_DIR;
}

afterEach(() => {
  if (originalWorkerId === undefined) {
    delete process.env.JEST_WORKER_ID;
  } else {
    process.env.JEST_WORKER_ID = originalWorkerId;
  }
  jest.resetModules();
});

afterAll(() => {
  for (const workerId of testWorkerIds) {
    const directory = path.resolve(process.cwd(), 'uploads', '.staging', workerId);
    // `force` makes a missing directory a no-op, so the `existsSync` guard is gone; `recursive`
    // survives a stray staged file, which is what made `rmdirSync` throw ENOTEMPTY.
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('upload staging directory — Jest worker isolation (#447)', () => {
  it('keeps the production path unchanged when no Jest worker is present', async () => {
    await expect(loadStagingDirectory(undefined)).resolves.toBe(
      path.resolve(process.cwd(), 'uploads', '.staging')
    );
  });

  it('gives each Jest worker a distinct child directory', async () => {
    const workerOne = await loadStagingDirectory(testWorkerIds[0]);
    const workerTwo = await loadStagingDirectory(testWorkerIds[1]);

    expect(workerOne).toBe(path.resolve(process.cwd(), 'uploads', '.staging', testWorkerIds[0]));
    expect(workerTwo).toBe(path.resolve(process.cwd(), 'uploads', '.staging', testWorkerIds[1]));
    expect(workerOne).not.toBe(workerTwo);
  });

  /**
   * The regex is the only thing standing between `JEST_WORKER_ID` and the `path.join` that builds
   * `STAGING_DIR`, and until these cases existed it had never been handed a value it was supposed
   * to reject. Widening it to `/^\d+$/`, or to a catch-all `[\s\S]` class, left all 993 tests
   * green at c22a826; narrowing it to `/^$/` did go red. That asymmetry is the tell — the accept
   * direction was pinned by the case above, the reject direction by nothing at all.
   *
   * Both values carry weight and neither covers the other: `../evil` leaves `/^\d+$/` alive,
   * because that pattern rejects letters anyway; `0` is what catches a pattern that dropped the
   * leading `[1-9]`. Deleting either block puts one of those mutants back.
   *
   * Under the catch-all, `../evil` makes `path.join` resolve outside the staging root and the
   * module creates that directory on import — `uploads/evil` really does appear on disk. Nothing
   * in production sets `JEST_WORKER_ID`, so this is drift insurance, not a live hole.
   */
  it.each(['0', '01'])('ignores the non-positive-integer worker id %p', async (workerId) => {
    await expect(loadStagingDirectory(workerId)).resolves.toBe(
      path.resolve(process.cwd(), 'uploads', '.staging')
    );
  });

  it('keeps a traversal worker id inside the staging root', async () => {
    await expect(loadStagingDirectory('../evil')).resolves.toBe(
      path.resolve(process.cwd(), 'uploads', '.staging')
    );
  });
});
