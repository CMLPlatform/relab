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
 * CI: see the e2e-full-stack job in .github/workflows/ci.yml
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A healthy CI run takes a few minutes. Stop a broken stack early with a report instead of
  // retrying every test until the job's own timeout kills it and leaves nothing to read.
  globalTimeout: process.env.CI ? 15 * 60_000 : undefined,
  maxFailures: process.env.CI ? 10 : undefined,
  // One retry in CI still records a trace (on-first-retry) without tripling a failing test's time.
  retries: process.env.CI ? 1 : 2,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Must share a host with the baked EXPO_PUBLIC_API_URL (localhost) so the
    // SameSite=Lax session cookies are treated as first-party; 127.0.0.1 vs
    // localhost is cross-site and the browser drops the auth cookie.
    baseURL: process.env.BASE_URL ?? 'http://localhost:18011',
    // Matches the zone's staging Super Bot Fight Mode skip rule (infra/cloudflare-zone).
    extraHTTPHeaders: process.env.E2E_EDGE_KEY
      ? { 'x-e2e-key': process.env.E2E_EDGE_KEY }
      : undefined,
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
  // Serves the pre-built Expo web dist/ unless BASE_URL is already set.
  // --single is load-bearing: app.json sets web.output "single", so dist/ holds
  // one index.html and every route is resolved client-side. Without the SPA
  // fallback every deep link (/products, /login, …) 404s here, while prod is
  // fine because Caddy does `try_files {path} /index.html`.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        // Started directly, not through `pnpm exec`: Playwright stops the web server
        // by signalling its process group, which pnpm's child does not stay in, so the
        // run then waits on a server that never exits.
        command: './node_modules/.bin/serve dist -l 18011 --single --no-clipboard',
        url: 'http://localhost:18011',
        // Never reuse: this serves the dist/ the recipe just built, and a server
        // left over from an earlier run keeps serving its own. Failing on a busy
        // port names the leftover process; reusing it tests a build nobody made
        // for this run.
        reuseExistingServer: false,
      },
});
