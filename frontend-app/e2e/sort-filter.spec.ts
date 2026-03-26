/**
 * Sort and filter controls E2E tests.
 *
 * These tests cover the sort menu, date-preset chips, brand/type filter
 * modals, and URL-based state persistence on the products page.
 *
 * Most tests run as a guest (no login required) because the controls are
 * visible to all users. Tests that verify "My Products" tab require auth.
 */

import { expect, test } from '@playwright/test';
import { loginAndReachProducts, reachProductsPage, selectMenuItem } from './helpers';

/** Navigate to /products and dismiss the welcome card if present. */
async function goToProducts(page: import('@playwright/test').Page) {
  await reachProductsPage(page);
}

// ─── Sort ──────────────────────────────────────────────────────────────────────

test.describe('Sort menu', () => {
  test('sort button is visible on the products page', async ({ page }) => {
    await goToProducts(page);
    await expect(page.getByLabel('Sort products')).toBeVisible();
  });

  test('sort button opens a menu with all expected options', async ({ page }) => {
    await goToProducts(page);
    await page.getByLabel('Sort products').click();
    await expect(page.getByText('Newest first')).toBeVisible();
    await expect(page.getByText('Oldest first')).toBeVisible();
    await expect(page.getByText('Name A→Z')).toBeVisible();
    await expect(page.getByText('Name Z→A')).toBeVisible();
    await expect(page.getByText('Brand A→Z')).toBeVisible();
    await expect(page.getByText('Brand Z→A')).toBeVisible();
  });

  test('selecting "Oldest first" updates the URL sort param', async ({ page }) => {
    await goToProducts(page);
    await page.getByLabel('Sort products').click();
    await selectMenuItem(page, 'Oldest first');
    await expect(page).toHaveURL(/sort=created_at/, { timeout: 3_000 });
  });

  test('selecting "Name A→Z" updates the URL sort param', async ({ page }) => {
    await goToProducts(page);
    await page.getByLabel('Sort products').click();
    await selectMenuItem(page, 'Name A→Z');
    await expect(page).toHaveURL(/sort=name/, { timeout: 3_000 });
  });

  test('sort menu closes after selecting an option', async ({ page }) => {
    await goToProducts(page);
    await page.getByLabel('Sort products').click();
    await expect(page.getByText('Newest first')).toBeVisible();
    await selectMenuItem(page, 'Newest first');
    await expect(page.getByText('Oldest first')).not.toBeVisible({ timeout: 2_000 });
  });
});

// ─── Date filter ───────────────────────────────────────────────────────────────

test.describe('Date filter chips', () => {
  test('all three date preset chips are visible', async ({ page }) => {
    await goToProducts(page);
    await expect(page.getByText('Last 7d')).toBeVisible();
    await expect(page.getByText('Last 30d')).toBeVisible();
    await expect(page.getByText('Last 90d')).toBeVisible();
  });

  test('clicking "Last 7d" updates the URL days param', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Last 7d').click();
    await expect(page).toHaveURL(/days=7/, { timeout: 3_000 });
  });

  test('clicking an active preset again removes the days param', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Last 30d').click();
    await expect(page).toHaveURL(/days=30/, { timeout: 3_000 });
    // Toggle off
    await page.getByText('Last 30d').click();
    await expect(page).not.toHaveURL(/days=/, { timeout: 3_000 });
  });

  test('only one date preset can be active at a time', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Last 7d').click();
    await expect(page).toHaveURL(/days=7/, { timeout: 3_000 });
    // Switching preset replaces the value
    await page.getByText('Last 90d').click();
    await expect(page).toHaveURL(/days=90/, { timeout: 3_000 });
    await expect(page).not.toHaveURL(/days=7/);
  });
});

// ─── Brand / Type filter modals ────────────────────────────────────────────────

test.describe('Brand filter', () => {
  test('Brand chip opens a filter modal with a search field', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Brand', { exact: true }).click();
    await expect(page.getByText('Filter by Brand')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Search brands…')).toBeVisible();
  });

  test('dismissing the brand modal closes it without filtering', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Brand', { exact: true }).click();
    await expect(page.getByText('Filter by Brand')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Filter by Brand')).not.toBeVisible({ timeout: 3_000 });
    // URL should not contain brands param
    await expect(page).not.toHaveURL(/brands=/);
  });
});

test.describe('Type filter', () => {
  test('Type chip opens a filter modal with a search field', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Type', { exact: true }).click();
    await expect(page.getByText('Filter by Product Type')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder('Search types…')).toBeVisible();
  });
});

// ─── Search URL sync ───────────────────────────────────────────────────────────

test.describe('Search URL sync', () => {
  test('search query appears in URL after the debounce delay', async ({ page }) => {
    await goToProducts(page);
    await page.getByPlaceholder('Search products').fill('test-query-abc');
    // The products page debounces search by 500 ms — allow up to 2 s for the URL to update
    await expect(page).toHaveURL(/q=test-query-abc/, { timeout: 2_000 });
  });

  test('clearing the search bar removes the q param from the URL', async ({ page }) => {
    await page.goto('/products?q=hello');
    await expect(page.getByPlaceholder('Search products')).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder('Search products').clear();
    await expect(page).not.toHaveURL(/q=/, { timeout: 2_000 });
  });

  test('search query loaded from URL populates the search bar', async ({ page }) => {
    await page.goto('/products?q=prefilled');
    await expect(page.getByPlaceholder('Search products')).toHaveValue('prefilled', { timeout: 5_000 });
  });
});

// ─── My Products tab (requires auth) ──────────────────────────────────────────

test.describe('My Products filter', () => {
  test('My Products tab is only visible after login', async ({ page }) => {
    // Guest — only "All Products" segment button exists
    await goToProducts(page);
    await expect(page.getByText('My Products')).not.toBeVisible();

    // After login — both segments appear
    await loginAndReachProducts(page);
    await expect(page.getByText('All Products')).toBeVisible();
    await expect(page.getByText('My Products')).toBeVisible();
  });

  test('clicking My Products updates the filterMode URL param', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByText('My Products').click();
    await expect(page).toHaveURL(/filterMode=mine/, { timeout: 3_000 });
  });

  test('switching back to All Products clears filterMode=mine', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByText('My Products').click();
    await expect(page).toHaveURL(/filterMode=mine/, { timeout: 3_000 });
    await page.getByText('All Products').click();
    await expect(page).toHaveURL(/filterMode=all/, { timeout: 3_000 });
  });
});
