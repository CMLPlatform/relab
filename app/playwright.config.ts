import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack E2E configuration for the Expo web app.
 *
 * Assumes the Docker backend stack (compose.e2e.yaml) is already running and
 * the Expo web build has already been exported to dist/ before this runs.
 *
 * Preferred local usage:
 *   just test-e2e-full-stack
 *
 * CI: see the e2e-full-stack job in .github/workflows/validate.yml
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
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
      grep: /@cross-browser/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: /@cross-browser/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      grep: /@cross-browser/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      grep: /@cross-browser/,
    },
  ],
  // Serves the pre-built Expo web dist/ unless BASE_URL is already set
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm exec serve dist -l 18081 --no-clipboard',
        url: 'http://localhost:18081',
        reuseExistingServer: !process.env.CI,
      },
});
