import { expect, test } from '@playwright/test';

const HEADER_LOGO_NAME = /relab/i;

// The page ground is a flat brand token, not a backdrop image: the blurred
// bg-*.jpg wallpaper was removed because it taxed the contrast of every line of
// body text on a reading surface. These are --relab-brand-surface resolved per
// scheme, so the test fails both if the theme stops switching and if the ground
// drifts off the brand background token.
const GROUND = { light: 'rgb(250, 251, 254)', dark: 'rgb(17, 20, 29)' } as const;

test('header logo renders and theme chooser updates the active theme', async ({ page }) => {
  await page.goto('/');

  const siteTitle = page.locator('.site-title').first();
  const logo = siteTitle.getByRole('img', { name: HEADER_LOGO_NAME });
  await expect(logo).toBeVisible();

  const themeSelect = page.locator('starlight-theme-select select').first();
  await themeSelect.selectOption('dark');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('dark');
  await expect
    .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(GROUND.dark);

  await themeSelect.selectOption('light');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('light');
  await expect
    .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(GROUND.light);
});
