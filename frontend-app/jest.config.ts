import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
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
    '!**/coverage/**',
    '!**/node_modules/**',
    // Root provider/theme setup — no business logic, calls setBackgroundColorAsync at module level
    '!src/app/_layout.tsx',
    // Large orchestration screen; its sub-components are each tested individually
    '!src/app/products/[id]/index.tsx',
    // Camera hardware — expo-camera and expo-image-picker cannot run in Jest
    '!src/app/products/[id]/camera.tsx',
    // Pure visual SVG geometry component — no branching logic to assert on
    '!src/components/common/SVGCube.tsx',
  ],
  coverageThreshold: {
    global: { statements: 80 },
  },
};

export default config;
