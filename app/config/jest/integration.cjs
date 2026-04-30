const sharedConfig = require('./shared.cjs');

module.exports = {
  ...sharedConfig,
  displayName: 'integration',
  setupFilesAfterEnv: ['<rootDir>/config/jest/setup.shared.ts'],
  testMatch: ['**/*.integration.test.[jt]s?(x)', '**/*-integration-test.[jt]s?(x)'],
};
