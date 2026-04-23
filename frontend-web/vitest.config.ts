import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/config/**', 'src/scripts/**'],
      exclude: [
        'node_modules/**',
        'e2e/**',
        'src/**/*.test.ts',
        // Thin DOM-wiring entry points — exercised by Playwright, not unit tests.
        'src/scripts/init.ts',
        'src/scripts/token-action.ts',
      ],
      reporter: ['text', 'lcov', 'json'],
      thresholds: {
        statements: 80,
      },
    },
  },
});

export default vitestConfig;
