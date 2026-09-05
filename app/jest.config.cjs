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
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  setupFiles: [...(expoPreset.setupFiles ?? []), '<rootDir>/config/setup.node.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/.*?/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|standard-navigation|msw|@mswjs|@open-draft/.*|until-async|rettime|@rn-primitives/.*|lucide-react-native|uniwind))',
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
    // Jest has no CSS loader; NativeWind applies global.css via Metro/Babel at
    // build time, not in tests, so map .css imports to a no-op stub.
    '\\.css$': '<rootDir>/config/cssMock.js',
  },
};

// Coverage and maxWorkers are global (root-only) concerns in multi-project mode —
// Jest ignores these keys if set per project — so they live here, not in `base`.
// Run a single lane with `jest --selectProjects unit` (or integration).
module.exports = {
  rootDir: __dirname,
  testTimeout: 15_000,
  watchman: false,
  // CI runners are dedicated, so use every core; locally leave headroom for the dev's machine.
  maxWorkers: process.env.CI ? '100%' : '50%',
  // In CI also emit JUnit XML for Codecov Test Analytics (flaky/slow-test tracking).
  reporters: process.env.CI
    ? ['default', ['jest-junit', { outputDirectory: '<rootDir>', outputName: 'junit.xml' }]]
    : ['default'],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/assets/**',
    '!src/types/**',
    '!src/test-utils/**',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!src/app/_layout.tsx',
    '!src/components/base/SVGCube.tsx',
    '!src/components/product/ProductCardSkeleton.tsx',
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 65, functions: 65 },
  },
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
