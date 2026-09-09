import { env } from 'node:process';

import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const runtimeConfig = {
  baseUrl: env.BASE_URL?.trim() || undefined,
  isCi: Boolean(env.CI?.trim()),
  // The live lane builds against the running E2E backend first (just build-e2e),
  // so its server must serve that dist/ rather than rebuild it from prod config.
  isLive: Boolean(env.WWW_E2E_LIVE?.trim()),
  // Matches the zone's staging Super Bot Fight Mode skip rule (infra/cloudflare-zone).
  e2eEdgeKey: env.E2E_EDGE_KEY?.trim() || undefined,
};
const localBaseUrl = 'http://127.0.0.1:18013';

const smokeTag = /@smoke/;

let retries = 0;
let workers: number | undefined;
let reporter: PlaywrightTestConfig['reporter'] = 'list';
if (runtimeConfig.isCi) {
  retries = 2;
  workers = 1;
  reporter = 'github';
}

// Skip the dev server when BASE_URL is set; the stack is already running (e.g. via docker compose)
let webServer: PlaywrightTestConfig['webServer'];
if (!runtimeConfig.baseUrl) {
  webServer = {
    // The just recipes build dist/ first (test-e2e, test-e2e-live); this only serves it.
    command: 'pnpm run preview:built',
    url: localBaseUrl,
    // Never reuse: the recipes build dist/ for this run, and a preview server
    // left over from an earlier one serves its dist instead — a stale build
    // whose live-lane image URLs point at a seed that no longer exists. Failing
    // on a busy port names the zombie; reusing it reports someone else's page.
    reuseExistingServer: false,
    // Astro daemonizes `astro preview` when it detects an agentic shell (am-i-vibing),
    // so the process this command starts exits at once and Playwright reports
    // "exited early". Any value disables that detection and keeps it in the foreground.
    env: { ASTRO_PREVIEW_BACKGROUND: '0' },
  };
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: runtimeConfig.isCi,
  retries,
  workers,
  reporter,
  webServer,
  use: {
    baseURL: runtimeConfig.baseUrl ?? localBaseUrl,
    extraHTTPHeaders: runtimeConfig.e2eEdgeKey
      ? { 'x-e2e-key': runtimeConfig.e2eEdgeKey }
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
      grep: smokeTag,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: smokeTag,
    },
  ],
});
