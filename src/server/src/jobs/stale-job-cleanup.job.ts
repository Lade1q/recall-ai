import { cleanupStaleJobs } from '../services/analysis.service';

// How often the sweep runs — independent of STALE_JOB_THRESHOLD_MS (the age at
// which a job counts as stuck). Issue #178.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the periodic background sweep that marks stuck `pending`/`processing`
 * AnalysisJobs as `failed` (Issue #178). Safe to call once at process startup;
 * calling it again while already running is a no-op.
 */
export function startStaleJobCleanupJob(): void {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    cleanupStaleJobs().catch((err) => {
      console.error('[stale-job-cleanup] sweep failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);

  // Don't hold the process open just for this timer.
  intervalHandle.unref();
}

/** Stops the sweep. Used by tests and graceful shutdown. */
export function stopStaleJobCleanupJob(): void {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}
