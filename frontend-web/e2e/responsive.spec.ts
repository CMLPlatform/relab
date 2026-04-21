import { expect, test } from '@playwright/test';

const OPEN_APP_LINK_NAME = /open( the)? app/i;
const BROWSE_GITHUB_LINK_NAME = /browse github/i;
const SUBSCRIBE_BUTTON_NAME = /subscribe/i;

test.describe('Responsive layout', () => {
  test('landing page is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: 'Reverse Engineering Lab',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: OPEN_APP_LINK_NAME })).toBeVisible();
  });

  test('landing page is usable on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        name: 'Reverse Engineering Lab',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: BROWSE_GITHUB_LINK_NAME })).toBeVisible();
    await expect(page.getByRole('button', { name: SUBSCRIBE_BUTTON_NAME })).toBeVisible();
  });

  test('privacy page is readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
