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
  test('unauthenticated user is redirected to the login screen', async ({ page }) => {
    await page.goto('/');
    // The app's root redirects unauthenticated users to the login screen
    await expect(page).toHaveURL(/login/);
    await expect(page.getByPlaceholder('Email address')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('login with wrong password shows an error', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Email address').fill(EMAIL);
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();
    // The app shows a "Login Failed" dialog on bad credentials
    await expect(page.getByText('Login Failed')).toBeVisible({ timeout: 10_000 });
  });

  test('login with correct credentials succeeds and leaves the login screen', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Email address').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    // After a successful login the user is taken to either onboarding (fresh
    // account with no username) or the products list (returning account).
    // Either way they must leave the login screen.
    await expect(page).not.toHaveURL(/login/, { timeout: 15_000 });
  });

  test('full new-user flow: login → onboarding → products', async ({ page }) => {
    await page.goto('/');

    // ── Login ───────────────────────────────────────────────────────────────
    await page.getByPlaceholder('Email address').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    // If the account has no username yet the app redirects to onboarding.
    // On a fresh E2E database this always happens on the first run.
    const url = await page.waitForURL(/onboarding|products/, { timeout: 15_000 });
    void url; // suppress lint — we just need to wait for navigation

    if (page.url().includes('onboarding')) {
      // ── Onboarding: set a username ────────────────────────────────────────
      const usernameInput = page.getByPlaceholder('Username');
      await expect(usernameInput).toBeVisible();
      await usernameInput.fill('e2etestuser');

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
