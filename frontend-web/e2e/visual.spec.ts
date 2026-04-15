import { expect, test } from '@playwright/test';

test.describe('Visual regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium baseline only');

  test('homepage remains visually stable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});
