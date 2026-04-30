const integrationConfig = require('./config/jest/integration.cjs');
const unitConfig = require('./config/jest/unit.cjs');

const rootOnlyOptions = new Set(['coverageReporters', 'testTimeout', 'watchman']);

function toProjectConfig(config) {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !rootOnlyOptions.has(key)));
}

module.exports = {
  rootDir: __dirname,
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'cobertura'],
  testTimeout: 15_000,
  watchman: false,
  projects: [toProjectConfig(unitConfig), toProjectConfig(integrationConfig)],
};
