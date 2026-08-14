/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
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
