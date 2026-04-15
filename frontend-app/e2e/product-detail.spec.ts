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
  openProductCreationDialog,
  openSeededProductFromProductsPage,
  reachProductsPage,
} from './helpers';

test.setTimeout(60_000);

/** Create a product via the FAB dialog and return the product name used. */
async function createProductViaDialog(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  await openProductCreationDialog(page);
  await page.getByPlaceholder('Product Name').fill(name);
  await page.getByRole('button', { name: 'OK' }).click();
}

// ─── Product detail navigation ─────────────────────────────────────────────────

test.describe('Product detail: navigation', () => {
  test('clicking a product card navigates to the detail page', async ({ page }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
  });

  test('product detail page shows the product name in the header', async ({ page }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
    await expect(
      page.getByRole('heading', { name: /^(Dell XPS 13|iPhone 12)$/ }).last(),
    ).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ─── Product creation flow ─────────────────────────────────────────────────────

test.describe('Product creation', () => {
  test('FAB opens the Create New Product dialog', async ({ page }) => {
    await loginAndReachProducts(page);
    await openProductCreationDialog(page);
    await expect(page.getByPlaceholder('Product Name')).toBeVisible();
    // OK button is disabled until the name meets the 2-character minimum
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();
  });

  test('OK button is disabled for names shorter than 2 characters', async ({ page }) => {
    await loginAndReachProducts(page);
    await openProductCreationDialog(page);
    await page.getByPlaceholder('Product Name').fill('x');
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();
  });

  test('OK button is disabled for names longer than 100 characters', async ({ page }) => {
    await loginAndReachProducts(page);
    await openProductCreationDialog(page);
    await page.getByPlaceholder('Product Name').fill('x'.repeat(101));
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();
  });

  test('OK button becomes enabled for a valid product name', async ({ page }) => {
    await loginAndReachProducts(page);
    await openProductCreationDialog(page);
    await page.getByPlaceholder('Product Name').fill('My Test Product');
    await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled({
      timeout: 2_000,
    });
  });

  test('submitting the dialog navigates to the new product detail page in edit mode', async ({
    page,
  }) => {
    await loginAndReachProducts(page);
    const productName = `E2E Test ${Date.now()}`;
    await createProductViaDialog(page, productName);

    // The app navigates to /products/new (then redirects to the created product's ID)
    await expect(page).toHaveURL(/products\/(new|\d+)/, { timeout: 15_000 });
    await expect(page.getByPlaceholder('Add a product description')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('canceling the dialog stays on the products page', async ({ page }) => {
    await loginAndReachProducts(page);
    await openProductCreationDialog(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Create New Product')).not.toBeVisible();
    await expect(page).toHaveURL(/\/products$|\/products\?/, {
      timeout: 2_000,
    });
  });
});

// ─── Product detail edit mode ──────────────────────────────────────────────────

test.describe('Product detail: edit mode', () => {
  test('new product page opens in edit mode with all major sections', async ({ page }) => {
    await loginAndReachProducts(page);
    const productName = `E2E Edit Test ${Date.now()}`;
    await createProductViaDialog(page, productName);
    await expect(page).toHaveURL(/products\/(new|\d+)/, { timeout: 15_000 });

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
    const productName = `E2E Guard Test ${Date.now()}`;
    await createProductViaDialog(page, productName);
    await expect(page).toHaveURL(/products\/(new|\d+)/, { timeout: 15_000 });
    await expect(page.getByPlaceholder('Add a product description')).toBeVisible({
      timeout: 10_000,
    });

    // Attempt to leave via the in-app header back control; the unsaved-changes guard should intercept.
    await page.getByRole('link', { name: /back/i }).click();
    await expect(page.getByText('Discard changes?')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: "Don't leave" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();

    // Choose "Don't leave"; stays on the product page
    await page.getByRole('button', { name: "Don't leave" }).click();
    await expect(page.getByText('Discard changes?')).not.toBeVisible();
    await expect(page).toHaveURL(/products\/(new|\d+)/);
  });
});
