/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Pages are covered by the Playwright E2E suites. Vitest covers src/lib and
// components whose structure is cheap to pin through Astro's container API;
// `getViteConfig` wires in Astro's Vite plugins so tests can render `.astro`.
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
