import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|msw|@mswjs|until-async)',
  ],
  moduleNameMapper: {
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
    // Barrel re-export file; no logic, just re-exports individual components
    '!src/components/base.ts',
    // Pure visual skeleton component; no branching logic to assert on
    '!src/components/common/ProductCardSkeleton.tsx',
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 65, functions: 65 },
  },
};

export default config;
