import { expect, test } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders with correct title and core links', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Reverse Engineering Lab');
    await expect(
      page.getByRole('heading', {
        name: 'Document products with less friction and more reusable evidence.',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /open( the)? app/i })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Stay in the loop', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: /subscribe/i })).toBeVisible();
  });

  test('publishes canonical and social metadata', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://cml-relab.org/',
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Reverse Engineering Lab',
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  });
});
