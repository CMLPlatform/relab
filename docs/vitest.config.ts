import { defineConfig } from 'vitest/config';

// Docs is a content/rendering site — pages and components are covered by the
// Playwright E2E suites. Vitest exists only for the handful of pure-logic
// modules under src/lib that have branching worth asserting directly.
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
  },
});
