import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack E2E configuration for the Expo web app.
 *
 * Assumes the Docker backend stack (compose.e2e.yml) is already running and
 * the Expo web build has already been exported to dist/ before this runs.
 *
 * Local usage:
 *   just e2e-backend-up          # starts the backend stack on :18432
 *   just frontend-app/build-web  # exports to dist/
 *   just frontend-app/test-e2e   # starts serve on :18081 + runs Playwright
 *   just e2e-backend-down        # stops the backend stack
 *
 * CI: see the e2e-full-stack job in .github/workflows/ci.yml
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:18081',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  // Serves the pre-built Expo web dist/ unless BASE_URL is already set
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npx serve dist -l 18081 --no-clipboard',
        url: 'http://localhost:18081',
        reuseExistingServer: !process.env.CI,
      },
});
