import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/config/**', 'src/copy/**', 'src/lib/**', 'src/scripts/**'],
      exclude: ['node_modules/**', 'e2e/**', 'src/**/*.test.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 80,
      },
    },
  },
});

export default vitestConfig;
