import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const DOCS_PREVIEW_URL = 'http://127.0.0.1:4300';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
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
    command: 'astro preview --port 4300 --host 127.0.0.1',
    url: DOCS_PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
