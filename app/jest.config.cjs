const integrationConfig = require('./config/jest/integration.cjs');
const unitConfig = require('./config/jest/unit.cjs');

module.exports = {
  rootDir: __dirname,
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'cobertura'],
  testTimeout: 15_000,
  watchman: false,
  projects: [unitConfig, integrationConfig],
};
