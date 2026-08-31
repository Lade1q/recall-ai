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
    if (fs.existsSync(directory)) fs.rmdirSync(directory);
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
});
