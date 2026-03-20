import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**'],
      exclude: ['node_modules/**', 'e2e/**'],
      reporter: ['text', 'lcov', 'json'],
      thresholds: {
        statements: 80,
      },
    },
  },
});
