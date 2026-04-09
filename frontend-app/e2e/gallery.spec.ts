import { expect, test, type Page } from '@playwright/test';
import {
  openGalleryLightbox,
  openProductByNameFromProductsPage,
  reachProductsPage,
} from './helpers';

const TRANSPARENT_GIF_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const galleryListProduct = {
  id: 1,
  name: 'iPhone 12',
  brand: 'Apple',
  model: 'A2403',
  description: 'Apple smartphone.',
  created_at: '2026-04-09T00:00:00Z',
  updated_at: '2026-04-09T00:00:00Z',
  product_type_id: 1,
  owner_id: 'seed-user-id',
  parent_id: null,
  amount_in_parent: null,
  physical_properties: {
    weight_g: 164,
    height_cm: 14.7,
    width_cm: 7.15,
    depth_cm: 0.74,
  },
  circularity_properties: {
    recyclability_comment: null,
    recyclability_observation: '',
    recyclability_reference: null,
    remanufacturability_comment: null,
    remanufacturability_observation: '',
    remanufacturability_reference: null,
    repairability_comment: null,
    repairability_observation: '',
    repairability_reference: null,
  },
  components: [],
  images: [
    {
      id: 10,
      image_url: TRANSPARENT_GIF_DATA_URL,
      thumbnail_url: TRANSPARENT_GIF_DATA_URL,
      description: 'Front view',
    },
    {
      id: 11,
      image_url: TRANSPARENT_GIF_DATA_URL,
      thumbnail_url: TRANSPARENT_GIF_DATA_URL,
      description: 'Back view',
    },
  ],
  videos: [],
  product_type: {
    id: 1,
    name: 'Smartphone',
    description: 'A handheld personal computer.',
  },
  owner_username: 'alice',
  thumbnail_url: TRANSPARENT_GIF_DATA_URL,
};

async function mockGalleryProductApi(page: Page) {
  await page.route('http://localhost:18432/products?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [galleryListProduct],
        total: 1,
        page: 1,
        size: 24,
        pages: 1,
      }),
    });
  });

  await page.route('http://localhost:18432/products/1?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(galleryListProduct),
    });
  });
}

test.describe('Product gallery (e2e)', () => {
  // Increase the per-test timeout for slower CI environments
  test.setTimeout(60_000);
  test('opens and closes lightbox from product page', async ({ page }) => {
    await mockGalleryProductApi(page);
    await reachProductsPage(page);
    await openProductByNameFromProductsPage(page, 'iPhone 12');

    await openGalleryLightbox(page);
    const close = page.getByLabel('Close lightbox');

    // Close via button
    await close.click();
    await expect(close).not.toBeVisible();
  });

  test('closes lightbox with Escape key', async ({ page }) => {
    await mockGalleryProductApi(page);
    await reachProductsPage(page);
    await openProductByNameFromProductsPage(page, 'iPhone 12');

    await openGalleryLightbox(page);

    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Close lightbox')).not.toBeVisible();
  });
});
