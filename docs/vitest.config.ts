/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Docs is a content/rendering site — pages are covered by the Playwright E2E
// suites. Vitest covers pure-logic modules under src/lib plus the rare
// component whose structure (rung order, counts) is cheap to pin directly
// via Astro's container API instead of only through E2E. `getViteConfig`
// wires in Astro's Vite plugins so tests can import and render `.astro`
// components.
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
