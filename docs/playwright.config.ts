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
    // Matches the zone's staging Super Bot Fight Mode skip rule (infra/cloudflare-zone).
    extraHTTPHeaders: process.env.E2E_EDGE_KEY ? { 'x-e2e-key': process.env.E2E_EDGE_KEY } : undefined,
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
    // Never reuse: this serves the dist/ the recipe just built, and a server
    // left over from an earlier run keeps serving its own. Failing on a busy
    // port names the leftover process; reusing it tests a build nobody made
    // for this run.
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    // Astro auto-detects an agentic shell (via am-i-vibing) and daemonizes `astro
    // preview` in that case, so the foreground process this webServer command starts
    // exits immediately and Playwright reports "exited early". Any value here disables
    // that detection and keeps the server in the foreground where Playwright can manage it.
    env: { ASTRO_PREVIEW_BACKGROUND: '0' },
  },
});
