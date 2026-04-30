import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/config/**', 'src/content/**', 'src/scripts/**'],
      exclude: ['node_modules/**', 'e2e/**', 'src/**/*.test.ts'],
      reporter: ['text', 'lcov', 'json'],
      thresholds: {
        statements: 80,
      },
    },
  },
});

export default vitestConfig;
