/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Only the deterministic Concept Graph Engine logic is covered here — it must stay
  // provable without a DB or an API key (SDP risk R05).
  collectCoverageFrom: [
    'src/utils/dag.ts',
    'src/utils/mastery.ts',
    'src/utils/interview-state.ts',
    'src/utils/dashboard-stats.ts',
    'src/services/traceback.service.ts',
  ],
};
