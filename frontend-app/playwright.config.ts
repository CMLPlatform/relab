import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack E2E configuration for the Expo web app.
 *
 * Assumes the Docker backend stack (compose.e2e.yml) is already running and
 * the Expo web build has already been exported to dist/ before this runs.
 *
 * Local usage:
 *   just frontend-app/build-web   # exports to dist/
 *   just frontend-app/test-e2e    # starts serve + runs Playwright
 *
 * CI: see the e2e-full-stack job in .github/workflows/tests.yml
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8081',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Serves the pre-built Expo web dist/ unless BASE_URL is already set
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npx serve dist -l 8081 --no-clipboard',
        url: 'http://localhost:8081',
        reuseExistingServer: !process.env.CI,
      },
});
