import process from 'node:process';
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const DOCS_PREVIEW_URL = 'http://127.0.0.1:18012';

let retries = 0;
let reporter: PlaywrightTestConfig['reporter'] = 'list';
if (process.env.CI) {
  retries = 2;
  reporter = 'github';
}

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  retries,
  reporter,
  use: {
    baseURL: DOCS_PREVIEW_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'astro preview --port 18012 --host 127.0.0.1 --strictPort',
    url: DOCS_PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
