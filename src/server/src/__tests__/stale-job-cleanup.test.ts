import { cleanupStaleJobs, STALE_JOB_THRESHOLD_MS } from '../services/analysis.service';
import prisma from '../config/prisma';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    analysisJob: { updateMany: jest.fn() },
  },
}));

// analysis.service also imports these — mock so the module loads without hitting
// real Gemini/fs code paths (unused by cleanupStaleJobs itself).
jest.mock('../services/gemini.service', () => ({
  extractConcepts: jest.fn(),
  uploadFile: jest.fn(),
}));
jest.mock('../services/graph.service', () => ({ validateDAG: jest.fn() }));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

describe('cleanupStaleJobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks pending/processing jobs older than the threshold as failed', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const count = await cleanupStaleJobs();

    expect(count).toBe(3);
    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending', 'processing'] },
        createdAt: { lt: new Date(Date.now() - STALE_JOB_THRESHOLD_MS) },
      },
      data: { status: 'failed', completedAt: expect.any(Date) },
    });
  });

  it('returns 0 when no jobs are stale', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const count = await cleanupStaleJobs();

    expect(count).toBe(0);
  });
});
