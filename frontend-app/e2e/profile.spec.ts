/**
 * Profile page E2E tests.
 *
 * Prerequisites:
 *   - compose.e2e.yml services are running
 *   - the Expo web app has been built for E2E
 *
 * Test user credentials come from backend/.env.test.
 */

import { expect, test } from '@playwright/test';
import { EMAIL, PASSWORD, finishOnboardingIfVisible, loginAndGoToProfile } from './helpers';

test.describe('Profile — access', () => {
  test('unauthenticated visit redirects to login', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/login/, { timeout: 5_000 });
  });

  test('header shows username pill (not Sign In) after login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email or username').fill(EMAIL);
    await page.getByPlaceholder('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/onboarding|products/, { timeout: 30_000 });
    await finishOnboardingIfVisible(page);
    // Once authenticated, the header pill switches from "Sign In" to the username
    await expect(page.getByText('Sign In', { exact: true })).not.toBeVisible({ timeout: 5_000 });
    // The header also shows the email address as part of the identity in the profile page,
    // verifying the auth state is reflected. Navigate to /profile to confirm it loads.
    await page.goto('/profile');
    await expect(page).toHaveURL(/profile/, { timeout: 5_000 });
    await expect(page.getByText('Hi,')).toBeVisible();
  });
});

test.describe('Profile — content', () => {
  test('displays user email and account status chips', async ({ page }) => {
    await loginAndGoToProfile(page);
    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
    // The e2e superuser is created with is_verified=True
    await expect(page.getByText('Verified')).toBeVisible();
    // The e2e superuser is a superuser
    await expect(page.getByText('Superuser')).toBeVisible();
  });

  test('shows all expected profile sections', async ({ page }) => {
    await loginAndGoToProfile(page);
    // Section headers rendered by SectionHeader component
    // Use exact: true for 'Account' since substring "Account" also appears in "Linked Accounts"
    await expect(page.getByText('Account', { exact: true })).toBeVisible();
    await expect(page.getByText('Email updates')).toBeVisible();
    await expect(page.getByText('Linked Accounts')).toBeVisible();
    await expect(page.getByText('Danger Zone')).toBeVisible();
  });

  test('newsletter subscription status text is displayed', async ({ page }) => {
    await loginAndGoToProfile(page);
    // After loading, one of these must be visible
    await expect(
      page.getByText(/You are (not )?subscribed\./)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('linked accounts section shows Google and GitHub options', async ({ page }) => {
    await loginAndGoToProfile(page);
    await expect(page.getByText(/^(Link Google Account|Unlink Google)$/)).toBeVisible();
    await expect(page.getByText(/^(Link GitHub Account|Unlink GitHub)$/)).toBeVisible();
  });
});

test.describe('Profile — dialogs', () => {
  test('tapping the username heading opens the edit-username dialog', async ({ page }) => {
    await loginAndGoToProfile(page);
    // The "Hi," Text and the username Pressable are siblings in the hero section.
    // Clicking the sibling immediately after "Hi," triggers setEditUsernameVisible.
    const hiText = page.getByText('Hi,');
    await expect(hiText).toBeVisible();
    await hiText.locator('xpath=following-sibling::*[1]').click();
    await expect(page.getByText('Edit Username')).toBeVisible({ timeout: 3_000 });
    // Dialog should have Cancel and Save buttons
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    // Dismiss without saving
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Edit Username')).not.toBeVisible();
  });

  test('logout button opens the confirmation dialog', async ({ page }) => {
    await loginAndGoToProfile(page);
    // "Logout" appears in the Account section as a ProfileAction title
    await page.getByText('Logout', { exact: true }).first().click();
    await expect(page.getByText('Are you sure you want to log out?')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' }).last()).toBeVisible();
  });

  test('canceling the logout dialog keeps the user on the profile page', async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.getByText('Logout', { exact: true }).first().click();
    await expect(page.getByText('Are you sure you want to log out?')).toBeVisible({ timeout: 3_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Are you sure you want to log out?')).not.toBeVisible();
    await expect(page).toHaveURL(/profile/);
  });

  test('confirming logout navigates to products and shows Sign In header', async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.getByText('Logout', { exact: true }).first().click();
    await expect(page.getByText('Are you sure you want to log out?')).toBeVisible({ timeout: 3_000 });
    // Click the dialog's Logout confirm button (last "Logout" on the page)
    await page.getByRole('button', { name: 'Logout' }).last().click();
    await expect(page).toHaveURL(/products/, { timeout: 10_000 });
    // The header should now show "Sign In" instead of the username
    await expect(page.getByText('Sign In', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('delete account dialog shows the contact email address', async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.getByText('Delete Account?').click();
    await expect(page.getByText('relab@cml.leidenuniv.nl')).toBeVisible({ timeout: 3_000 });
    // Dismiss the dialog
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByText('relab@cml.leidenuniv.nl')).not.toBeVisible();
  });
});
