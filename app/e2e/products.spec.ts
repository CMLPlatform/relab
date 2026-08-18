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
import {
  dismissProductsInfoCard,
  finishOnboardingIfVisible,
  loginAndReachProducts,
  openNewProductPage,
  openProductFilters,
  suppressGuestWelcomeCard,
} from './helpers';

const LOGIN_URL_PATTERN = /login/;
const ONBOARDING_OR_PRODUCTS_URL_PATTERN = /onboarding|products/;
// The seeded iPhone 12 is the one list product carrying a photograph.
const THUMBNAIL_URL_PATTERN = /\/uploads\/images\/.+/;

async function registerNewUserAndReachProducts(page: import('@playwright/test').Page) {
  const unique = Date.now();
  const username = `empty${unique}`;
  const email = `empty-${unique}@example.com`;
  const password = 'correct-horse-battery-staple-v42';

  await page.goto('/new-account');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByTestId('username-next').click();
  await page.getByLabel('Email address').fill(email);
  await page.getByTestId('email-next').click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Registration no longer auto-logs-in (non-enumerable signup): dismiss the
  // verify-email prompt, then log in with the new credentials to reach products.
  await expect(page.getByText('Check your email')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page).toHaveURL(LOGIN_URL_PATTERN, { timeout: 5_000 });

  await page.getByLabel('Email or username').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(ONBOARDING_OR_PRODUCTS_URL_PATTERN, { timeout: 30_000 });
  await finishOnboardingIfVisible(page);
  await dismissProductsInfoCard(page);
  await expect(page.getByPlaceholder('Search products')).toBeVisible({ timeout: 10_000 });
}

test.describe('Guest access', () => {
  test('products page is publicly accessible without signing in', {
    tag: '@cross-browser',
  }, async ({ page }) => {
    // The guest welcome card carries its own "Sign in" button, so suppressing it
    // leaves the header pill as the only match for the assertion below.
    await suppressGuestWelcomeCard(page);
    await page.goto('/products');
    await dismissProductsInfoCard(page);
    await expect(page.getByPlaceholder('Search products')).toBeVisible({
      timeout: 10_000,
    });
    // Header shows "Sign in" pill for guests
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });
});

test.describe('Products page', () => {
  test('products page loads with correct filter tabs and search bar', {
    tag: ['@cross-browser', '@auth'],
  }, async ({ page }) => {
    await loginAndReachProducts(page);
    await expect(page.getByPlaceholder('Search products')).toBeVisible();
    // The chip row is collapsed by default — a first visit is search + records.
    await expect(page.getByText('Date', { exact: true })).not.toBeVisible();
    await openProductFilters(page);
    await expect(page.getByText('Mine', { exact: true })).toBeVisible();
    await expect(page.getByText('Date', { exact: true })).toBeVisible();
  });

  test('empty state is shown when no products exist', async ({ page }) => {
    await registerNewUserAndReachProducts(page);
    await openProductFilters(page);
    await page.getByText('Mine', { exact: true }).click();
    await expect(page.getByText("You haven't created any products yet. Tap the")).toBeVisible({
      timeout: 10_000,
    });
  });

  test('new product page opens for a verified user', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
  });

  test('a seeded product thumbnail is fetched from the API and really is an image', async ({
    page,
  }) => {
    // Every other test here would pass against a wall of broken images: a
    // failed load swaps the <img> for a placeholder (ProductCard's onError),
    // and nothing asserts which one it got. This walks the whole chain — seeded
    // image row, API-built thumbnail URL, app-side URL resolution, bytes.
    const thumbnailRequest = page.waitForRequest(THUMBNAIL_URL_PATTERN);
    await page.goto('/products');
    await dismissProductsInfoCard(page);
    const url = (await thumbnailRequest).url();

    // Fetched rather than asserted on the rendered <img>: both origins here are
    // ports on 127.0.0.1, which has no registrable domain, and Chromium blocks
    // that cross-port load under the API's Cross-Origin-Resource-Policy:
    // same-site (backend response_policy.py relaxes it only under debug).
    // Deployed origins are both *.cml-relab.org and load normally, so the block
    // is an artefact of the rig; the request is what this lane can honestly
    // assert. www's live lane makes the same trade in landing-live.spec.ts.
    const response = await page.request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  });
});

test.describe('Search', () => {
  test('typing in the search bar shows the no-results message for an unlikely query', async ({
    page,
  }) => {
    await loginAndReachProducts(page);
    await page.getByPlaceholder('Search products').fill('xyz_no_match_99999');
    // searchQuery state updates immediately, so the no-match message appears before
    // the debounced API call even fires
    await expect(page.getByText('No products match your search.')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('clearing the search bar restores the default empty-state message', async ({ page }) => {
    // A fresh account, not the shared admin: the "Mine" empty state is only
    // reachable for a user who owns nothing, and the product-creation specs add
    // products under the admin during the same run.
    await registerNewUserAndReachProducts(page);
    const searchBar = page.getByPlaceholder('Search products');
    await searchBar.fill('xyz_no_match_99999');
    await expect(page.getByText('No products match your search.')).toBeVisible({
      timeout: 5_000,
    });
    await searchBar.clear();
    await openProductFilters(page);
    await page.getByText('Mine', { exact: true }).click();
    await expect(page.getByText("You haven't created any products yet. Tap the")).toBeVisible({
      timeout: 5_000,
    });
  });
});
