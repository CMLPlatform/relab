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
  retries: 2,
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Must share a host with the baked EXPO_PUBLIC_API_URL (localhost) so the
    // SameSite=Lax session cookies are treated as first-party; 127.0.0.1 vs
    // localhost is cross-site and the browser drops the auth cookie.
    baseURL: process.env.BASE_URL ?? 'http://localhost:18011',
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
    // WebKit refuses __Host-/Secure cookies over http://localhost (Chromium and
    // Firefox treat localhost as a secure context; Safari does not), so the
    // session never persists and auth-gated flows can't run. Exclude @auth tests
    // on the two WebKit-backed projects. CI runs this suite on chromium only.
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: /@cross-browser/,
      grepInvert: /@auth/,
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
      grepInvert: /@auth/,
    },
  ],
  // Serves the pre-built Expo web dist/ unless BASE_URL is already set
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm exec serve dist -l 18011 --no-clipboard',
        url: 'http://localhost:18011',
        reuseExistingServer: !process.env.CI,
      },
});
