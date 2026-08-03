/**
 * Profile page E2E tests.
 *
 * Prerequisites:
 *   - compose.e2e.yaml services are running
 *   - the Expo web app has been built for E2E
 *
 * Test user credentials come from backend/.env.test.
 */

import { expect, test } from '@playwright/test';
import { EMAIL, finishOnboardingIfVisible, loginAndGoToProfile, PASSWORD } from './helpers';

const LOGIN_URL_PATTERN = /login/;
const ONBOARDING_OR_PRODUCTS_URL_PATTERN = /onboarding|products/;
// The profile page is served at the /account route.
const PROFILE_URL_PATTERN = /account/;
const EMAIL_UPDATES_STATUS_PATTERN = /Currently (enabled|disabled)\./;
// Matches AccountSections.tsx's ProfileLinkedAccountsSection titles exactly
// (lowercase "account" in the not-yet-linked case — see its own unit test).
const GOOGLE_LINK_PATTERN = /^(Link Google account|Unlink Google)$/;
const GITHUB_LINK_PATTERN = /^(Link GitHub account|Unlink GitHub)$/;
const PRODUCTS_URL_PATTERN = /products/;

test.describe('Profile: access', () => {
  test('unauthenticated visit redirects to login', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(LOGIN_URL_PATTERN, { timeout: 5_000 });
  });

  test('header shows username pill (not Sign in) after login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(ONBOARDING_OR_PRODUCTS_URL_PATTERN, { timeout: 30_000 });
    await finishOnboardingIfVisible(page);
    // Once authenticated, the header pill switches from "Sign in" to the username
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).not.toBeVisible({
      timeout: 5_000,
    });
    // The header also shows the email address as part of the identity in the profile page,
    // verifying the auth state is reflected. Navigate to /account to confirm it loads.
    await page.goto('/account');
    await expect(page).toHaveURL(PROFILE_URL_PATTERN, { timeout: 5_000 });
    await expect(page.getByText('Hi,')).toBeVisible();
  });
});

test.describe('Profile: content', () => {
  test('displays user email and account status chips', {
    tag: ['@cross-browser', '@auth'],
  }, async ({ page }) => {
    await loginAndGoToProfile(page);
    await expect(page.getByText(EMAIL)).toBeVisible();
    // exact: true — "Active" as a substring also matches "End all active sessions…".
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    // The e2e superuser is created with is_verified=True
    await expect(page.getByText('Verified')).toBeVisible();
    // The e2e superuser is a superuser
    await expect(page.getByText('Superuser')).toBeVisible();
  });

  test('shows all expected profile sections', async ({ page }) => {
    await loginAndGoToProfile(page);
    // Section headers are the four ACCOUNT_SECTIONS titles (accountSections.tsx)
    // — the account screen's grouped-section restructure retired the old
    // standalone "Account"/"Email updates"/"Linked accounts" headings, and the
    // stats row folded into the hero header rather than its own "Profile"
    // section. Each title doubles as the section-nav chip/outline label, so
    // exact + .last() targets the Section heading (nav renders first in DOM
    // order).
    await Promise.all(
      ['Preferences', 'Integrations', 'Security & sessions', 'Danger zone'].map((title) =>
        expect(page.getByText(title, { exact: true }).last()).toBeVisible(),
      ),
    );
  });

  test('email updates status text is displayed', async ({ page }) => {
    await loginAndGoToProfile(page);
    await expect(page.getByText(EMAIL_UPDATES_STATUS_PATTERN)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('linked accounts section shows Google and GitHub options', async ({ page }) => {
    await loginAndGoToProfile(page);
    await expect(page.getByText(GOOGLE_LINK_PATTERN)).toBeVisible();
    await expect(page.getByText(GITHUB_LINK_PATTERN)).toBeVisible();
  });
});

test.describe('Profile: username dialog', () => {
  test('tapping the username heading opens the edit-username dialog', async ({ page }) => {
    await loginAndGoToProfile(page);
    // The "Hi," Text and the username Pressable are siblings in the hero section.
    // Clicking the sibling immediately after "Hi," triggers setEditUsernameVisible.
    const hiText = page.getByText('Hi,');
    await expect(hiText).toBeVisible();
    await hiText.locator('xpath=following-sibling::*[1]').click();
    await expect(page.getByText('Edit username')).toBeVisible({
      timeout: 3_000,
    });
    // Dialog should have Cancel and Save buttons
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    // Dismiss without saving
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Edit username')).not.toBeVisible();
  });
});

test.describe('Profile: logout dialog', () => {
  test('logout button opens the confirmation dialog', async ({ page }) => {
    await loginAndGoToProfile(page);
    // "Sign out" appears in the Account section as a ProfileAction title
    await page.getByText('Sign out', { exact: true }).first().click();
    await expect(page.getByText('Are you sure you want to sign out?')).toBeVisible({
      timeout: 3_000,
    });
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true }).last()).toBeVisible();
  });

  test('canceling the logout dialog keeps the user on the profile page', async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.getByText('Sign out', { exact: true }).first().click();
    await expect(page.getByText('Are you sure you want to sign out?')).toBeVisible({
      timeout: 3_000,
    });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Are you sure you want to sign out?')).not.toBeVisible();
    await expect(page).toHaveURL(PROFILE_URL_PATTERN);
  });

  test('confirming logout navigates to products and shows Sign in header', {
    tag: ['@cross-browser', '@auth'],
  }, async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
    await expect(page.getByText('Are you sure you want to sign out?')).toBeVisible({
      timeout: 5_000,
    });
    // Click the dialog's Sign out confirm button (last "Sign out" on the page)
    await page.getByRole('button', { name: 'Sign out', exact: true }).last().click();
    await expect(page).toHaveURL(PRODUCTS_URL_PATTERN, { timeout: 15_000 });
    // The header should now show "Sign in" instead of the username
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe('Profile: delete dialog', () => {
  test('delete account dialog shows the contact email address', async ({ page }) => {
    await loginAndGoToProfile(page);
    await page.getByText('Delete account?').click();
    await expect(page.getByText('relab@cml.leidenuniv.nl')).toBeVisible({
      timeout: 3_000,
    });
    // Dismiss the dialog
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByText('relab@cml.leidenuniv.nl')).not.toBeVisible();
  });
});
