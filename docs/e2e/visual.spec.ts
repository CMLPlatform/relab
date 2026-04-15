import { expect, test } from '@playwright/test';

test('homepage chrome remains visually stable on desktop', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(page).toHaveScreenshot('homepage-desktop.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});

test('homepage chrome remains visually stable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage-mobile.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});

test('architecture diagram page remains visually stable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto('/architecture/system-design/');
  await expect(page).toHaveScreenshot('system-design-desktop.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});

test('404 page remains visually stable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/404/');
  await expect(page).toHaveScreenshot('404-desktop.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});
