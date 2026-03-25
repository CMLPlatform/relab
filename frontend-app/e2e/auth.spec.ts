/**
 * Full-stack auth E2E tests.
 *
 * Prerequisites (handled by the CI job / just frontend-app/e2e-setup):
 *   - compose.e2e.yml services are running
 *   - Migrations have been applied
 *   - Superuser has been created via create_superuser.py
 *
 * Test user credentials come from backend/.env.test:
 *   SUPERUSER_EMAIL=e2e-admin@example.com
 *   SUPERUSER_PASSWORD=E2eTestPass123!
 */

import { expect, test } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'E2eTestPass123!';

test.describe('Authentication flow', () => {
  test('unauthenticated user can browse the products page without signing in', async ({ page }) => {
    await page.goto('/');
    // Root redirects to /products — publicly accessible without login
    await expect(page).toHaveURL(/products/, { timeout: 5_000 });
    // Header shows Sign In pill for guests
    await expect(page.getByText('Sign In')).toBeVisible();
  });

  test('login page shows expected fields and navigation links', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder('Email or username')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot Password?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a new account' })).toBeVisible();
  });

  test('login with wrong password shows an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email or username').fill(EMAIL);
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();
    // The app shows a "Login Failed" dialog on bad credentials
    await expect(page.getByText('Login Failed')).toBeVisible({ timeout: 10_000 });
  });

  test('login with correct credentials succeeds and leaves the login screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email or username').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    // After a successful login the user is taken to either onboarding (fresh
    // account with no username) or the products list (returning account).
    // Either way they must leave the login screen.
    await expect(page).not.toHaveURL(/login/, { timeout: 15_000 });
  });

  test('full new-user flow: login → onboarding → products', async ({ page }) => {
    await page.goto('/login');

    // ── Login ───────────────────────────────────────────────────────────────
    await page.getByPlaceholder('Email or username').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    // If the account has no username yet the app redirects to onboarding.
    // On a fresh E2E database this always happens on the first run.
    await page.waitForURL(/onboarding|products/, { timeout: 15_000 });

    if (page.url().includes('onboarding')) {
      // ── Onboarding: set a username ────────────────────────────────────────
      const usernameInput = page.getByPlaceholder('Username');
      await expect(usernameInput).toBeVisible();
      await usernameInput.fill('e2e_test_user');

      // Press the forward button (the enabled chevron-right)
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

      // After onboarding the user should land on the products tab
      await expect(page).toHaveURL(/products/, { timeout: 15_000 });
    }

    // ── Verify products screen loaded ────────────────────────────────────────
    await expect(page.getByText('All Products')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Account registration', () => {
  test('registration page is accessible from the login screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create a new account' }).click();
    await expect(page).toHaveURL(/new-account/, { timeout: 5_000 });
    await expect(page.getByPlaceholder('Username')).toBeVisible();
  });

  test('full registration flow: username → email → password → products', async ({ page }) => {
    // Use a timestamp-based unique identity to avoid collisions across runs
    const unique = Date.now();
    const username = `e2e${unique}`;
    const email = `e2e-${unique}@example.com`;
    const password = 'E2eNewPass123!';

    await page.goto('/new-account');

    // Step 1: choose a username
    await page.getByPlaceholder('Username').fill(username);
    // The chevron-right button is the sibling of the username input; click it once enabled
    await page.getByPlaceholder('Username').locator('xpath=..').locator('button').click();

    // Step 2: enter an email address
    await expect(page.getByPlaceholder('Email address')).toBeVisible({ timeout: 3_000 });
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByPlaceholder('Email address').locator('xpath=..').locator('button').click();

    // Step 3: choose a password
    await expect(page.getByPlaceholder('Password')).toBeVisible({ timeout: 3_000 });
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Create Account' }).click();

    // After registration + auto-login the app navigates to /products
    await expect(page).toHaveURL(/products/, { timeout: 15_000 });
  });
});

test.describe('Forgot password', () => {
  test('forgot password page renders and accepts a valid email', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByText('Forgot Password')).toBeVisible();

    // Fill in a known email and submit
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    // Backend responds with a generic success regardless of whether the email exists
    await expect(
      page.getByText('If an account exists with this email, you will receive password reset instructions.'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('forgot password page is accessible from the login screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await expect(page).toHaveURL(/forgot-password/, { timeout: 5_000 });
  });
});
