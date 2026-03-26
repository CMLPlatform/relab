import { expect, test } from '@playwright/test';
import { openGalleryLightbox, openProductByNameFromProductsPage, reachProductsPage } from './helpers';

test.describe('Product gallery (e2e)', () => {
  // Increase the per-test timeout for slower CI environments
  test.setTimeout(60_000);
  test('opens and closes lightbox from product page', async ({ page }) => {
    await reachProductsPage(page);
    await openProductByNameFromProductsPage(page, 'iPhone 12');

    await openGalleryLightbox(page);
    const close = page.getByLabel('Close lightbox');

    // Close via button
    await close.click();
    await expect(close).not.toBeVisible();
  });

  test('closes lightbox with Escape key', async ({ page }) => {
    await reachProductsPage(page);
    await openProductByNameFromProductsPage(page, 'iPhone 12');

    await openGalleryLightbox(page);

    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Close lightbox')).not.toBeVisible();
  });
});
