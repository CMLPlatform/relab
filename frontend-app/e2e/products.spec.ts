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

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'E2eTestPass123!';

/** Log in and complete onboarding if needed. Returns once on the products page. */
async function loginAndReachProducts(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByPlaceholder('Email or username').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();

  await page.waitForURL(/onboarding|products/, { timeout: 15_000 });

  if (page.url().includes('onboarding')) {
    const usernameInput = page.getByPlaceholder('Username');
    await usernameInput.fill('e2e_test_user');
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const disabled = await btn.getAttribute('aria-disabled');
      if (!disabled || disabled === 'false') {
        await btn.click();
        break;
      }
    }
    await page.waitForURL(/products/, { timeout: 15_000 });
  }

  // Dismiss the first-visit welcome dialog if it is showing (each test starts
  // with a fresh browser context so localStorage is empty and the dialog always
  // appears). The dialog is non-dismissable, so we must press Continue.
  const continueBtn = page.getByRole('button', { name: 'Continue' });
  if (await continueBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await continueBtn.click();
  }
}

test.describe('Guest access', () => {
  test('products page is publicly accessible without signing in', async ({ page }) => {
    await page.goto('/products');
    // Dismiss welcome dialog (fresh browser context = no localStorage)
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await continueBtn.click();
    }
    await expect(page.getByPlaceholder('Search products')).toBeVisible({ timeout: 10_000 });
    // Header shows "Sign In" pill for guests
    await expect(page.getByText('Sign In')).toBeVisible();
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
    await expect(page.getByText('No products yet. Create your first one!')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('product creation dialog opens for a verified user', async ({ page }) => {
    await loginAndReachProducts(page);
    await page.getByText('New Product').click();
    // The superuser is created with is_verified=True so this dialog should appear
    await expect(page.getByText('Create New Product')).toBeVisible({ timeout: 5_000 });
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
    await expect(page.getByText('No products yet. Create your first one!')).toBeVisible({ timeout: 5_000 });
  });
});
