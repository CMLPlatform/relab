import { defineConfig, devices } from '@playwright/test';

import { getNodeRuntimeConfig } from './config/runtime.ts';

const runtimeConfig = getNodeRuntimeConfig();
const localBaseUrl = 'http://localhost:8081';

// Structural (ARIA) snapshots only run on desktop Chromium — one baseline
// is enough to catch landmark/heading regressions. Other projects ignore it.
const structureSpec = /structure\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: runtimeConfig.isCi,
  retries: runtimeConfig.isCi ? 2 : 0,
  workers: runtimeConfig.isCi ? 1 : undefined,
  reporter: runtimeConfig.isCi ? 'github' : 'list',
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
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: structureSpec,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testIgnore: structureSpec,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      testIgnore: structureSpec,
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'] },
      testIgnore: structureSpec,
    },
  ],
  // Skip the dev server when BASE_URL is set; the stack is already running (e.g. via docker compose)
  webServer: runtimeConfig.baseUrl
    ? undefined
    : {
        command: 'pnpm run preview',
        url: localBaseUrl,
        reuseExistingServer: !runtimeConfig.isCi,
      },
});
