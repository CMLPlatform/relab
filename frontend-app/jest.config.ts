import type { Config } from 'jest';

// We use require here because jest-expo/jest-preset is a CJS module
// and we want to ensure we're getting the object correctly for merging.
const expoPreset = require('jest-expo/jest-preset');

const config: Config = {
  ...expoPreset,
  // Use fake timers globally to prevent leaked animation timers (from
  // react-native-paper, Animated, etc.) causing "worker failed to exit
  // gracefully" warnings.  Tests that need real timers can call
  // jest.useRealTimers() locally.
  fakeTimers: { enableGlobally: true },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],

  // We must correctly un-ignore packages in pnpm's nested node_modules.
  // The negative lookahead includes (.pnpm/.*?/node_modules/)? to handle this.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/.*?/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|msw|@mswjs|until-async|rettime))',
  ],

  // We add .mjs support by copying the existing [jt]sx? transformer from expoPreset.
  // This ensures we keep the 'metro' caller metadata which is required for
  // babel-preset-expo to transform React Native hooks correctly.
  transform: {
    ...expoPreset.transform,
    '^.+\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },

  // Ensure we include 'js' and other standard extensions along with 'mjs'
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node', 'mjs'],

  moduleNameMapper: {
    ...expoPreset.moduleNameMapper,
    '^@/(.*)$': '<rootDir>/src/$1',
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
  },

  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'cobertura'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/assets/**',
    '!src/types/**',
    '!src/test-utils/**',
    '!**/coverage/**',
    '!**/node_modules/**',
    // Root provider/theme setup; no business logic, calls setBackgroundColorAsync at module level
    '!src/app/_layout.tsx',
    // Pure visual SVG geometry component; no branching logic to assert on
    '!src/components/common/SVGCube.tsx',
    // Pure visual skeleton component; no branching logic to assert on
    '!src/components/common/ProductCardSkeleton.tsx',
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 65, functions: 65 },
  },
};

export default config;
