/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// `getViteConfig` wires in Astro's Vite plugins so tests can import and render
// `.astro` components (via the Container API) and resolve the "@/*" alias.
export default getViteConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    // In CI also emit JUnit XML for Codecov Test Analytics (flaky/slow-test tracking).
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './junit.xml' },
    coverage: {
      provider: 'v8',
      include: [
        'src/components/**',
        'src/config/**',
        'src/copy/**',
        'src/lib/**',
        'src/scripts/**',
      ],
      exclude: ['node_modules/**', 'e2e/**', 'src/**/*.test.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 80,
      },
    },
  },
});
