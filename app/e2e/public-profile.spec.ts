/**
 * Public profile (/users/[username]) E2E tests.
 *
 * The sibling profile.spec.ts covers the *own-account* screen at /account;
 * this covers the public, viewer-facing profile a product's owner link points at.
 *
 * Prerequisites:
 *   - compose.e2e.yaml services are running
 *   - the Expo web app has been built for E2E
 *
 * Seeded usernames come from backend/data/seed/dummy_data.json; seeded accounts
 * keep the default `public` profile visibility, so a signed-out visitor can read
 * them without the /account screen's login redirect.
 */

import { expect, test } from '@playwright/test';
import { openProductByNameFromProductsPage, reachProductsPage } from './helpers';

const SEEDED_USERNAME = 'alice';
// Seeded product (dummy_data.json). Its owner cycles over the seeded users, so
// the click-through asserts against the link's own text, not a fixed username.
const SEEDED_PRODUCT_NAME = 'iPhone 12';
const PROFILE_URL_PATTERN = /\/users\/[^/]+$/;
// ProductMetaData's owner link: aria-label "View <username>'s profile".
const OWNER_LINK_NAME_PATTERN = /^View .+'s profile$/;
// UserProducts' header once the count has loaded ("Products · 3").
const PRODUCTS_HEADER_PATTERN = /^Products · \d+$/;
// The product_count stat card moved into that header; these three remain.
const STAT_LABELS = ['Total kg', 'Photos', 'Top category'];

test.describe('Public profile', () => {
  test('a signed-out visitor can read a public profile', {
    tag: ['@cross-browser'],
  }, async ({ page }) => {
    await page.goto(`/users/${SEEDED_USERNAME}`);

    // No redirect to /login: unlike /account, this route is public.
    await expect(page).toHaveURL(PROFILE_URL_PATTERN, { timeout: 10_000 });
    await expect(page.getByText(SEEDED_USERNAME, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Avatar initials, from username.substring(0, 2).toUpperCase()
    await expect(
      page.getByText(SEEDED_USERNAME.slice(0, 2).toUpperCase(), { exact: true }),
    ).toBeVisible();
    await Promise.all(
      STAT_LABELS.map((label) => expect(page.getByText(label, { exact: true })).toBeVisible()),
    );
  });

  test('the profile lists that user’s public products', async ({ page }) => {
    await page.goto(`/users/${SEEDED_USERNAME}`);

    // Header carries the count, so waiting on it also waits out the skeleton.
    await expect(page.getByText(PRODUCTS_HEADER_PATTERN)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('user-products')).toBeVisible();
  });

  test('an unknown username shows the not-found error state', async ({ page }) => {
    await page.goto('/users/definitely_not_a_seeded_user');

    await expect(page.getByText("Couldn't load profile")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('This profile is private or does not exist.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('the owner link on a product opens that profile', async ({ page }) => {
    await reachProductsPage(page);
    await openProductByNameFromProductsPage(page, SEEDED_PRODUCT_NAME);

    // ProductMetaData renders "Owner: <username>" in the detail footer, with the
    // username as an expo-router Link (an <a> on web).
    const ownerLink = page.getByRole('link', { name: OWNER_LINK_NAME_PATTERN });
    await expect(ownerLink).toBeVisible({ timeout: 15_000 });
    const owner = (await ownerLink.innerText()).trim();
    await ownerLink.click();

    await expect(page).toHaveURL(new RegExp(`/users/${owner}$`), { timeout: 15_000 });
    // The screen header, not the page body: the product page's own owner link
    // also carries this text and lingers as a hidden node after the navigation.
    await expect(page.getByRole('heading', { name: owner, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });
});
