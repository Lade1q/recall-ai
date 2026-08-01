import { startStaleJobCleanupJob, stopStaleJobCleanupJob } from '../jobs/stale-job-cleanup.job';
import * as analysisService from '../services/analysis.service';

jest.mock('../services/analysis.service', () => ({
  cleanupStaleJobs: jest.fn(),
}));

const mockedCleanup = analysisService.cleanupStaleJobs as jest.Mock;

describe('stale-job-cleanup scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedCleanup.mockReset().mockResolvedValue(0);
  });

  afterEach(() => {
    stopStaleJobCleanupJob();
    jest.useRealTimers();
  });

  it('runs cleanupStaleJobs on each tick once started', async () => {
    startStaleJobCleanupJob();
    expect(mockedCleanup).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedCleanup).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedCleanup).toHaveBeenCalledTimes(2);
  });

  it('does not start a second interval when called again while running', async () => {
    startStaleJobCleanupJob();
    startStaleJobCleanupJob();

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedCleanup).toHaveBeenCalledTimes(1);
  });

  it('stops ticking after stopStaleJobCleanupJob', async () => {
    startStaleJobCleanupJob();
    stopStaleJobCleanupJob();

    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(mockedCleanup).not.toHaveBeenCalled();
  });

  it('swallows cleanup errors so the interval keeps running', async () => {
    mockedCleanup.mockRejectedValueOnce(new Error('db down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    startStaleJobCleanupJob();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalled();

    mockedCleanup.mockResolvedValueOnce(0);
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedCleanup).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });
});
