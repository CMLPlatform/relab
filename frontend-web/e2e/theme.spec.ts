import { expect, test } from '@playwright/test';

test.describe('Theme control', () => {
  test('cycles through the available themes and updates document state', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('[data-theme-toggle]');
    const html = page.locator('html');
    const metaTheme = page.locator('meta[name="theme-color"][data-dynamic-theme]');

    await expect(html).toHaveAttribute('data-theme-preference', 'system');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme-preference', 'light');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(metaTheme).toHaveAttribute('content', '#eef4f7');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme-preference', 'dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(metaTheme).toHaveAttribute('content', '#0a141d');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme-preference', 'system');
  });

  test('persists explicit theme choice across reloads', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-theme-toggle]');

    await toggle.click();
    await toggle.click();

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('system theme follows the browser color scheme preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    const toggle = page.locator('[data-theme-toggle]');
    await toggle.click();
    await toggle.click();
    await toggle.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
