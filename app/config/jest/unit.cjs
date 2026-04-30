const sharedConfig = require('./shared.cjs');

const sharedIgnorePatterns = sharedConfig.testPathIgnorePatterns ?? [];

module.exports = {
  ...sharedConfig,
  displayName: 'unit',
  setupFilesAfterEnv: [
    '<rootDir>/config/jest/setup.shared.ts',
    '<rootDir>/config/jest/setup.unit.ts',
  ],
  testMatch: ['**/*.test.[jt]s?(x)', '**/*-test.[jt]s?(x)'],
  testPathIgnorePatterns: [
    ...sharedIgnorePatterns,
    '\\.integration\\.test\\.[jt]sx?$',
    '-integration-test\\.[jt]sx?$',
  ],
};
