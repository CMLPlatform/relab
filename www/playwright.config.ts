import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

import { getNodeRuntimeConfig } from './config/runtime.ts';

const runtimeConfig = getNodeRuntimeConfig();
const localBaseUrl = 'http://127.0.0.1:18013';

// Structural (ARIA) snapshots only run on desktop Chromium — one baseline
// is enough to catch landmark/heading regressions. Other projects ignore it.
const structureSpec = /structure\.spec\.ts/;
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
    command: 'pnpm run preview:e2e',
    url: localBaseUrl,
    reuseExistingServer: !runtimeConfig.isCi,
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
      testIgnore: structureSpec,
      grep: smokeTag,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: structureSpec,
      grep: smokeTag,
    },
  ],
});
