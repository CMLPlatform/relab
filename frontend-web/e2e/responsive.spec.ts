import { expect, test } from '@playwright/test';

test.describe('Responsive layout', () => {
  test('landing page is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: 'Document products with less friction and more reusable evidence.',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /open( the)? app/i })).toBeVisible();
  });

  test('landing page is usable on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: 'Document products with less friction and more reusable evidence.',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /browse github/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /subscribe/i })).toBeVisible();
  });

  test('privacy page is readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
