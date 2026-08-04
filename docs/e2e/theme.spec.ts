import { expect, test } from '@playwright/test';

const HEADER_LOGO_NAME = /relab/i;

// The backdrops live in src/assets, so the build emits them content-hashed under
// /_astro/ where Caddy serves them immutable. Matching the hash keeps this test
// honest: if they ever slip back to an unhashed /images/ path, it fails.
const backdrop = (theme: 'light' | 'dark') =>
  new RegExp(String.raw`/_astro/bg-${theme}\.[\w-]+\.jpg`);

test('header logo renders and theme chooser updates the active theme', async ({ page }) => {
  await page.goto('/');

  const siteTitle = page.locator('.site-title').first();
  const logo = siteTitle.getByRole('img', { name: HEADER_LOGO_NAME });
  await expect(logo).toBeVisible();

  const themeSelect = page.locator('starlight-theme-select select').first();
  await themeSelect.selectOption('dark');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('dark');
  await expect
    .poll(async () =>
      page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage),
    )
    .toMatch(backdrop('dark'));

  await themeSelect.selectOption('light');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('light');
  await expect
    .poll(async () =>
      page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage),
    )
    .toMatch(backdrop('light'));
});
