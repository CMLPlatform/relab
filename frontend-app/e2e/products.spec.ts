/**
 * Full-stack products E2E smoke tests.
 *
 * These tests verify that the frontend ↔ backend ↔ database integration is
 * working for the core product data flow. They run after auth.spec.ts has
 * already completed the onboarding step (so the test user has a username).
 *
 * If auth.spec.ts is skipped or run in isolation, these tests will also go
 * through the login/onboarding flow via the shared helper.
 */

import { expect, test } from '@playwright/test';
import { dismissProductsInfoCard, loginAndReachProducts, openProductCreationDialog } from './helpers';

test.describe('Guest access', () => {
  test('products page is publicly accessible without signing in', async ({ page }) => {
    await page.goto('/products');
    await dismissProductsInfoCard(page);
    await expect(page.getByPlaceholder('Search products')).toBeVisible({ timeout: 10_000 });
    // Header shows "Sign In" pill for guests
    await expect(page.getByText('Sign In', { exact: true })).toBeVisible();
  });
});

test.describe('Products page', () => {
  test('products page loads with correct filter tabs and search bar', async ({ page }) => {
    await loginAndReachProducts(page);
    await expect(page.getByText('All Products')).toBeVisible();
    await expect(page.getByText('My Products')).toBeVisible();
    await expect(page.getByPlaceholder('Search products')).toBeVisible();
  });

  test('empty state is shown when no products exist', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByText('My Products').click();
    await expect(page.getByText("You haven't created any products yet. Tap the")).toBeVisible({
      timeout: 10_000,
    });
  });

  test('product creation dialog opens for a verified user', async ({ page }) => {
    await loginAndReachProducts(page);
    await openProductCreationDialog(page);
  });
});

test.describe('Search', () => {
  test('typing in the search bar shows the no-results message for an unlikely query', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByPlaceholder('Search products').fill('xyz_no_match_99999');
    // searchQuery state updates immediately, so the no-match message appears before
    // the debounced API call even fires
    await expect(page.getByText('No products found matching your search.')).toBeVisible({ timeout: 5_000 });
  });

  test('clearing the search bar restores the default empty-state message', async ({ page }) => {
    await loginAndReachProducts(page);
    const searchBar = page.getByPlaceholder('Search products');
    await searchBar.fill('xyz_no_match_99999');
    await expect(page.getByText('No products found matching your search.')).toBeVisible({ timeout: 5_000 });
    await searchBar.clear();
    await page.getByText('My Products').click();
    await expect(page.getByText("You haven't created any products yet. Tap the")).toBeVisible({ timeout: 5_000 });
  });
});
