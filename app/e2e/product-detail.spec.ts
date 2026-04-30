/**
 * Product detail page E2E tests.
 *
 * Covers: creating a new product via the FAB dialog, verifying the detail
 * page loads in edit mode, editing fields, and the unsaved-changes guard.
 *
 * The test user (e2e-admin) is a verified superuser, so the "Create New
 * Product" dialog is always accessible without the email-verification gate.
 */

import { expect, test } from '@playwright/test';
import {
  loginAndReachProducts,
  openNewProductPage,
  openSeededProductFromProductsPage,
  reachProductsPage,
} from './helpers';

test.setTimeout(60_000);

const SEEDED_PRODUCT_NAME_PATTERN = /^(Dell XPS 13|iPhone 12)$/;
const NEW_OR_PRODUCT_DETAIL_URL_PATTERN = /products\/(new|\d+)/;
const PRODUCT_DETAIL_URL_PATTERN = /products\/\d+/;
const PRODUCTS_LIST_URL_PATTERN = /\/products$|\/products\?/;
const BACK_LINK_NAME_PATTERN = /back/i;

async function fillProductName(page: import('@playwright/test').Page, name: string): Promise<void> {
  const nameInput = page.getByRole('textbox', { name: 'Product name' });
  await nameInput.fill(name);
  await nameInput.blur();
}

async function fillRequiredProductFields(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  await fillProductName(page, name);
  const weightInput = page.getByPlaceholder('> 0').first();
  await weightInput.fill('42');
  await weightInput.blur();
}

async function saveNewProduct(page: import('@playwright/test').Page, name: string): Promise<void> {
  await openNewProductPage(page);
  await fillRequiredProductFields(page, name);
  await expect(page.getByRole('button', { name: 'Save Product' })).toBeEnabled({
    timeout: 5_000,
  });
  await page.getByRole('button', { name: 'Save Product' }).click();
}

// ─── Product detail navigation ─────────────────────────────────────────────────

test.describe('Product detail: navigation', () => {
  test('clicking a product card navigates to the detail page', { tag: '@cross-browser' }, async ({
    page,
  }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
  });

  test('product detail page shows the product name in the header', async ({ page }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
    await expect(
      page.getByRole('heading', { name: SEEDED_PRODUCT_NAME_PATTERN }).last(),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Product creation flow ─────────────────────────────────────────────────────

test.describe('Product creation', () => {
  test('FAB opens the new product page in edit mode', { tag: '@cross-browser' }, async ({
    page,
  }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await expect(page.getByRole('textbox', { name: 'Product name' })).toBeVisible();
    // Save is disabled until the name meets the 2-character minimum.
    await expect(page.getByRole('button', { name: 'Save Product' })).toBeDisabled();
  });

  test('Save button is disabled for names shorter than 2 characters', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await fillProductName(page, 'x');
    await expect(page.getByRole('button', { name: 'Save Product' })).toBeDisabled();
  });

  test('Product name input caps names at 100 characters', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    const nameInput = page.getByRole('textbox', { name: 'Product name' });
    await nameInput.fill('x'.repeat(101));
    await expect(nameInput).toHaveValue('x'.repeat(100));
  });

  test('Save button becomes enabled after required fields are valid', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await fillRequiredProductFields(page, 'My Test Product');
    await expect(page.getByRole('button', { name: 'Save Product' })).toBeEnabled({
      timeout: 2_000,
    });
  });

  test('saving the new product navigates to the created product detail page', async ({ page }) => {
    await loginAndReachProducts(page);
    const productName = `E2E Test ${Date.now()}`;
    await saveNewProduct(page, productName);

    await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: productName })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('discarding the new draft returns to the products page', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await page.getByRole('link', { name: BACK_LINK_NAME_PATTERN }).click();
    await expect(page.getByText('Discard changes?')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(PRODUCTS_LIST_URL_PATTERN, {
      timeout: 10_000,
    });
  });
});

// ─── Product detail edit mode ──────────────────────────────────────────────────

test.describe('Product detail: edit mode', () => {
  test('new product page opens in edit mode with all major sections', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await expect(page).toHaveURL(NEW_OR_PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });

    // Key sections that should be visible in edit mode
    await expect(page.getByPlaceholder('Add a product description')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Physical Properties')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText('Circularity Properties')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText('Metadata')).toBeVisible({ timeout: 5_000 });
  });

  test('unsaved-changes guard blocks navigation mid-edit', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await expect(page).toHaveURL(NEW_OR_PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });
    await expect(page.getByPlaceholder('Add a product description')).toBeVisible({
      timeout: 10_000,
    });
    // Make the form dirty so the unsaved-changes guard fires (form starts pristine after creation)
    await page.getByPlaceholder('Add a product description').fill('test description');

    // Attempt to leave via the in-app header back control; the unsaved-changes guard should intercept.
    await page.getByRole('link', { name: BACK_LINK_NAME_PATTERN }).click();
    await expect(page.getByText('Discard changes?')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: "Don't leave" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();

    // Choose "Don't leave"; stays on the product page
    await page.getByRole('button', { name: "Don't leave" }).click();
    await expect(page.getByText('Discard changes?')).not.toBeVisible();
    await expect(page).toHaveURL(NEW_OR_PRODUCT_DETAIL_URL_PATTERN);
  });
});
