/**
 * Full-stack auth E2E tests.
 *
 * Prerequisites:
 *   - compose.e2e.yaml services are running
 *   - the Expo web app has been built for E2E
 *
 * Test user credentials come from backend/.env.test:
 *   SUPERUSER_EMAIL=e2e-admin@example.com
 *   SUPERUSER_PASSWORD=E2eTestPass123!
 */

import { expect, test } from '@playwright/test';
import { EMAIL, finishOnboardingIfVisible, PASSWORD } from './helpers';

const PRODUCTS_URL_PATTERN = /products/;
const ONBOARDING_OR_PRODUCTS_URL_PATTERN = /onboarding|products/;
const NEW_ACCOUNT_URL_PATTERN = /new-account/;
const FORGOT_PASSWORD_URL_PATTERN = /forgot-password/;
const FORGOT_PASSWORD_SUCCESS_PATTERN = /If an account exists with this email/;

test.describe('Authentication flow', () => {
  test('unauthenticated user can browse the products page without signing in', async ({ page }) => {
    await page.goto('/');
    // Root redirects to /products; publicly accessible without login
    await expect(page).toHaveURL(PRODUCTS_URL_PATTERN, { timeout: 5_000 });
    // Header shows Sign In pill for guests
    await expect(page.getByText('Sign In', { exact: true })).toBeVisible();
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
    await expect(page.getByText('Login Failed')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('login with correct credentials succeeds and leaves the login screen', {
    tag: '@cross-browser',
  }, async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email or username').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(ONBOARDING_OR_PRODUCTS_URL_PATTERN, { timeout: 30_000 });
  });

  test('full new-user flow: login → onboarding → products', { tag: '@cross-browser' }, async ({
    page,
  }) => {
    await page.goto('/login');

    // ── Login ───────────────────────────────────────────────────────────────
    await page.getByPlaceholder('Email or username').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(ONBOARDING_OR_PRODUCTS_URL_PATTERN, { timeout: 30_000 });
    await finishOnboardingIfVisible(page);

    // ── Verify products screen loaded ────────────────────────────────────────
    await expect(page.getByPlaceholder('Search products')).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('Account registration', () => {
  test('registration page is accessible from the login screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create a new account' }).click();
    await expect(page).toHaveURL(NEW_ACCOUNT_URL_PATTERN, { timeout: 5_000 });
    await expect(page.getByPlaceholder('Username', { exact: true })).toBeVisible();
  });

  test('full registration flow: username → email → password → products', {
    tag: '@cross-browser',
  }, async ({ page }) => {
    // Use a timestamp-based unique identity to avoid collisions across runs
    const unique = Date.now();
    const username = `e2e${unique}`;
    const email = `e2e-${unique}@example.com`;
    const password = 'E2eNewPass123!';

    await page.goto('/new-account');

    // Step 1: choose a username
    await page.getByPlaceholder('Username', { exact: true }).fill(username);
    await page.getByTestId('username-next').click();

    // Step 2: enter an email address
    await expect(page.getByPlaceholder('Email address')).toBeVisible({
      timeout: 3_000,
    });
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByTestId('email-next').click();

    // Step 3: choose a password
    await expect(page.getByPlaceholder('Password')).toBeVisible({
      timeout: 3_000,
    });
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Create Account' }).click();

    // After registration + auto-login the app navigates to /products.
    await expect(page).toHaveURL(PRODUCTS_URL_PATTERN, { timeout: 30_000 });
  });
});

test.describe('Forgot password', () => {
  test('forgot password page renders and accepts a valid email', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByText('Forgot Password')).toBeVisible();

    // Fill in a known email and submit
    // React Native Paper's label prop is visual-only and not an ARIA label
    await page.getByRole('textbox').fill(EMAIL);
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByText(FORGOT_PASSWORD_SUCCESS_PATTERN)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('forgot password page is accessible from the login screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await expect(page).toHaveURL(FORGOT_PASSWORD_URL_PATTERN, { timeout: 5_000 });
  });
});
