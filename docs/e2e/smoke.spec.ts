import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SEARCH_BUTTON_NAME = /search/i;

test('core docs routes render and search UI is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: SEARCH_BUTTON_NAME })).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Getting started', exact: true }),
  ).toBeVisible();

  await page.goto('/architecture/system-design/');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'System design' }).first(),
  ).toBeVisible();

  await page.goto('/operations/install/');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Install', exact: true }).first(),
  ).toBeVisible();
});

// `astro preview` ignores dist/_headers, so this applies the built CSP to each
// page itself: an inline script the hashes miss fails here, not in production.
test('pages run under the built CSP without violations', async ({ page }) => {
  const headers = readFileSync(new URL('../dist/_headers', import.meta.url), 'utf8');
  const csp = headers.match(/^ {2}Content-Security-Policy: (.+)$/m)?.[1];
  expect(csp).toBeTruthy();

  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const isPage = response.headers()['content-type']?.includes('text/html');
    await route.fulfill({
      response,
      headers: isPage
        ? { ...response.headers(), 'content-security-policy': csp as string }
        : response.headers(),
    });
  });

  const violations: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
      violations.push(`${page.url()}: ${msg.text()}`);
    }
  });

  for (const path of ['/', '/architecture/system-design/', '/api/public/']) {
    // biome-ignore lint/performance/noAwaitInLoops: one page, so each route loads after the last.
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }

  expect(violations).toEqual([]);
});

test('diagrams fit their frame and open full size in a new tab', async ({ page }) => {
  await page.goto('/architecture/datamodel/');
  const link = page.getByRole('link', { name: 'View full size (opens in a new tab)' }).first();
  await expect(link).toHaveAttribute('href', /^blob:/);

  const overflow = await page
    .locator('.relab-mermaid')
    .first()
    .evaluate((frame) => frame.scrollWidth - frame.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup.locator('svg').first()).toBeVisible();
});
