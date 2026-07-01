// jest-expo exposes its preset as CommonJS.
const expoPreset = require('jest-expo/jest-preset');

// Shared base for both test projects, spread into each project below so
// transform, module resolution, and coverage collection apply identically to
// the unit and integration lanes.
const base = {
  ...expoPreset,
  rootDir: __dirname,
  fakeTimers: {
    enableGlobally: true,
    doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
  },
  maxWorkers: '50%',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/.*?/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|msw|@mswjs|@open-draft/.*|until-async|rettime))',
  ],
  transform: {
    ...expoPreset.transform,
    '^.+\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node', 'mjs'],
  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    '^@/(.*)$': '<rootDir>/src/$1',
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/assets/**',
    '!src/types/**',
    '!src/test-utils/**',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!src/app/_layout.tsx',
    '!src/components/common/SVGCube.tsx',
    '!src/components/common/ProductCardSkeleton.tsx',
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 65, functions: 65 },
  },
};

// Run a single lane with `jest --selectProjects unit` (or integration).
module.exports = {
  rootDir: __dirname,
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'cobertura'],
  testTimeout: 15_000,
  watchman: false,
  projects: [
    {
      ...base,
      displayName: 'unit',
      setupFilesAfterEnv: ['<rootDir>/config/setup.shared.ts', '<rootDir>/config/setup.unit.ts'],
      testMatch: ['**/*.test.[jt]s?(x)'],
      testPathIgnorePatterns: [...base.testPathIgnorePatterns, '\\.integration\\.test\\.[jt]sx?$'],
    },
    {
      ...base,
      displayName: 'integration',
      setupFilesAfterEnv: ['<rootDir>/config/setup.shared.ts'],
      testMatch: ['**/*.integration.test.[jt]s?(x)'],
    },
  ],
};
