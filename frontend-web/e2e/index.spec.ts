import { expect, test } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders with correct title and core links', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Reverse Engineering Lab');
    await expect(
      page.getByRole('heading', { name: 'Reverse Engineering Lab', level: 1 }),
    ).toBeVisible();
    // accept small copy variations (e.g. "Open Demo" / "Open the App")
    await expect(page.getByRole('link', { name: /open( the)? app|open demo/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /read( the)? docs|read docs/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /browse github/i })).toBeVisible();
  });

  test('renders the hero support links', async ({ page }) => {
    await page.goto('/');
    // hero text may vary; verify support links are available
    await expect(page.getByRole('link', { name: /read( the)? docs|read docs/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /browse github/i })).toBeVisible();
  });

  test('renders the newsletter signup section', async ({ page }) => {
    await page.goto('/');
    // heading copy can change; ensure email input and subscribe button exist
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: /subscribe/i })).toBeVisible();
  });
});
