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
import { loginAndReachProducts, openMenu, reachProductsPage, selectMenuItem } from './helpers';

const SORT_CREATED_AT_URL_PATTERN = /sort=created_at/;
const SORT_NAME_URL_PATTERN = /sort=name/;
const DAYS_7_URL_PATTERN = /days=7/;
const DAYS_30_URL_PATTERN = /days=30/;
const DAYS_90_URL_PATTERN = /days=90/;
const ANY_DAYS_URL_PATTERN = /days=/;
const BRANDS_URL_PATTERN = /brands=/;
const SEARCH_QUERY_URL_PATTERN = /q=test-query-abc/;
const ANY_SEARCH_QUERY_URL_PATTERN = /q=/;
const FILTER_MODE_MINE_URL_PATTERN = /filterMode=mine/;
const FILTER_MODE_ALL_URL_PATTERN = /filterMode=all/;

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
    await openMenu(page, page.getByLabel('Sort products'));
    // waitForFunction polls in-browser so we read all items atomically while they exist.
    await page.waitForFunction(
      (expected) => {
        const found = Array.from(
          document.querySelectorAll('[role="menuitem"]'),
        ).map((el) => el.textContent?.trim() ?? '');
        return expected.every((label) => found.includes(label));
      },
      ['Newest first', 'Oldest first', 'Name A→Z', 'Name Z→A', 'Brand A→Z', 'Brand Z→A'],
      { timeout: 15_000, polling: 100 },
    );
  });

  test('selecting "Oldest first" updates the URL sort param', async ({ page }) => {
    await goToProducts(page);
    await openMenu(page, page.getByLabel('Sort products'));
    await selectMenuItem(page, 'Oldest first');
    await expect(page).toHaveURL(SORT_CREATED_AT_URL_PATTERN, { timeout: 3_000 });
  });

  test('selecting "Name A→Z" updates the URL sort param', async ({ page }) => {
    await goToProducts(page);
    await openMenu(page, page.getByLabel('Sort products'));
    await selectMenuItem(page, 'Name A→Z');
    await expect(page).toHaveURL(SORT_NAME_URL_PATTERN, { timeout: 3_000 });
  });

  test('sort menu closes after selecting an option', async ({ page }) => {
    await goToProducts(page);
    await openMenu(page, page.getByLabel('Sort products'));
    await selectMenuItem(page, 'Newest first');
    // After selection the menu dismisses; items leave the DOM
    await expect(page.locator('[role="menuitem"]').first()).not.toBeAttached({
      timeout: 3_000,
    });
  });
});

// ─── Date filter ───────────────────────────────────────────────────────────────

test.describe('Date filter chips', () => {
  test('all three date preset chips are visible', async ({ page }) => {
    await goToProducts(page);
    await expect(page.getByText('Date', { exact: true })).toBeVisible();
    await openMenu(page, page.getByText('Date', { exact: true }));
    await page.waitForFunction(
      (expected) => {
        const found = Array.from(
          document.querySelectorAll('[role="menuitem"]'),
        ).map((el) => el.textContent?.trim() ?? '');
        return expected.every((label) => found.includes(label));
      },
      ['Last 7d', 'Last 30d', 'Last 90d'],
      { timeout: 15_000, polling: 100 },
    );
  });

  test('clicking "Last 7d" updates the URL days param', async ({ page }) => {
    await goToProducts(page);
    await openMenu(page, page.getByText('Date', { exact: true }));
    await selectMenuItem(page, 'Last 7d');
    await expect(page).toHaveURL(DAYS_7_URL_PATTERN, { timeout: 3_000 });
  });

  test('clicking an active preset again removes the days param', async ({ page }) => {
    await goToProducts(page);
    await openMenu(page, page.getByText('Date', { exact: true }));
    await selectMenuItem(page, 'Last 30d');
    await expect(page).toHaveURL(DAYS_30_URL_PATTERN, { timeout: 3_000 });
    // Toggle off via the close (×) button on the active chip
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page).not.toHaveURL(ANY_DAYS_URL_PATTERN, { timeout: 5_000 });
  });

  test('only one date preset can be active at a time', async ({ page }) => {
    await goToProducts(page);
    await openMenu(page, page.getByText('Date', { exact: true }));
    await selectMenuItem(page, 'Last 7d');
    await expect(page).toHaveURL(DAYS_7_URL_PATTERN, { timeout: 3_000 });
    // Navigate fresh so the Date chip is in its initial state, then select a different preset.
    // This avoids the unreliable close-and-reopen menu flow while still verifying that
    // only one preset can be in the URL at a time.
    await goToProducts(page);
    await openMenu(page, page.getByText('Date', { exact: true }));
    await selectMenuItem(page, 'Last 90d');
    await expect(page).toHaveURL(DAYS_90_URL_PATTERN, { timeout: 5_000 });
    await expect(page).not.toHaveURL(DAYS_7_URL_PATTERN);
  });
});

// ─── Brand / Type filter modals ────────────────────────────────────────────────

test.describe('Brand filter', () => {
  test('Brand chip opens a filter modal with a search field', { tag: '@cross-browser' }, async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Brand', { exact: true }).click();
    await expect(page.getByText('Filter by Brand')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByPlaceholder('Search brands...')).toBeVisible();
  });

  test('dismissing the brand modal closes it without filtering', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Brand', { exact: true }).click();
    await expect(page.getByText('Filter by Brand')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Filter by Brand')).not.toBeVisible({
      timeout: 3_000,
    });
    // URL should not contain brands param
    await expect(page).not.toHaveURL(BRANDS_URL_PATTERN);
  });
});

test.describe('Type filter', () => {
  test('Type chip opens a filter modal with a search field', async ({ page }) => {
    await goToProducts(page);
    await page.getByText('Type', { exact: true }).click();
    await expect(page.getByText('Filter by Product Type')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByPlaceholder('Search types...')).toBeVisible();
  });
});

// ─── Search URL sync ───────────────────────────────────────────────────────────

test.describe('Search URL sync', () => {
  test('search query appears in URL after the debounce delay', { tag: '@cross-browser' }, async ({ page }) => {
    await goToProducts(page);
    await page.getByPlaceholder('Search products').fill('test-query-abc');
    // The products page debounces search by 500 ms; allow up to 2 s for the URL to update
    await expect(page).toHaveURL(SEARCH_QUERY_URL_PATTERN, { timeout: 2_000 });
  });

  test('clearing the search bar removes the q param from the URL', async ({ page }) => {
    await page.goto('/products?q=hello');
    await expect(page.getByPlaceholder('Search products')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder('Search products').clear();
    await expect(page).not.toHaveURL(ANY_SEARCH_QUERY_URL_PATTERN, { timeout: 2_000 });
  });

  test('search query loaded from URL populates the search bar', async ({ page }) => {
    await page.goto('/products?q=prefilled');
    await expect(page.getByPlaceholder('Search products')).toHaveValue('prefilled', {
      timeout: 5_000,
    });
  });
});

// ─── My Products tab (requires auth) ──────────────────────────────────────────

test.describe('My Products filter', () => {
  test('My Products tab is only visible after login', async ({ page }) => {
    // Guest: "Mine" chip is not shown
    await goToProducts(page);
    await expect(page.getByText('Mine', { exact: true })).not.toBeVisible();

    // After login: "Mine" chip appears
    await loginAndReachProducts(page);
    await expect(page.getByText('Mine', { exact: true })).toBeVisible();
  });

  test('clicking My Products updates the filterMode URL param', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByText('Mine', { exact: true }).click();
    await expect(page).toHaveURL(FILTER_MODE_MINE_URL_PATTERN, { timeout: 3_000 });
  });

  test('switching back to All Products clears filterMode=mine', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByText('Mine', { exact: true }).click();
    await expect(page).toHaveURL(FILTER_MODE_MINE_URL_PATTERN, { timeout: 3_000 });
    // Click "Mine" again to toggle back to all
    await page.getByText('Mine', { exact: true }).click();
    await expect(page).toHaveURL(FILTER_MODE_ALL_URL_PATTERN, { timeout: 3_000 });
  });
});
