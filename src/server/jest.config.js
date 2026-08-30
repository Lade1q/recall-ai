/** @type {import('ts-jest').JestConfigWithTsJest} */

// Local runs only. Several review/build lanes run this suite at the same time in separate
// worktrees on one machine, and jest's default of `cores - 1` meant two lanes alone put 22
// workers on a 12-core box: load average 88 and ~3.2 GB of worker RSS, which pushed the machine
// into swap. The swapping is what made it stall — a suite pinning the CPU is expected and fine.
// CI gets one job on its own runner, so it keeps jest's default.
//
// The key is left OUT rather than set to `undefined`: jest 30 rejects an explicit undefined with
// "maxWorkers has to be of type string or number". Both '3' and '50%' are accepted values, so
// JEST_MAX_WORKERS can be either when you know you are the only thing running.
const workerCap = process.env.CI ? {} : { maxWorkers: process.env.JEST_MAX_WORKERS ?? 3 };

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  ...workerCap,
  // Only the deterministic Concept Graph Engine logic is covered here — it must stay
  // provable without a DB or an API key (SDP risk R05).
  collectCoverageFrom: [
    'src/utils/checkpoint.ts',
    'src/utils/dag.ts',
    'src/utils/evidence-guard.ts',
    'src/utils/evidence-tally.ts',
    'src/utils/evidence-write.ts',
    'src/utils/mastery.ts',
    'src/utils/interview-state.ts',
    'src/utils/dashboard-stats.ts',
    'src/services/traceback.service.ts',
    'src/services/scheduling.service.ts',
  ],
  testPathIgnorePatterns: ['<rootDir>/src/__tests__/helpers/'],
};
