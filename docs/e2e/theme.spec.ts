import { expect, test } from '@playwright/test';

test('header logo renders and theme chooser updates the active theme', async ({ page }) => {
  await page.goto('/');

  const siteTitle = page.locator('.site-title').first();
  const logo = siteTitle.getByRole('img', { name: /reverse engineering lab logo/i });
  await expect(logo).toBeVisible();

  const themeSelect = page.locator('starlight-theme-select select').first();
  await themeSelect.selectOption('dark');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('dark');
  await expect
    .poll(async () =>
      page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage),
    )
    .toContain('bg-dark.jpg');

  await themeSelect.selectOption('light');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('light');
  await expect
    .poll(async () =>
      page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage),
    )
    .toContain('bg-light.jpg');
});
