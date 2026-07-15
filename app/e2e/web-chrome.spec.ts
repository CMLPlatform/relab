/**
 * Desktop web chrome E2E tests: the persistent top nav (src/components/base/
 * TopNav.tsx) shown at >=lg, and its handoff with the native stack header it
 * replaces for the screens it covers (src/app/_layout.tsx's hideForTopNav).
 */

import { expect, test } from '@playwright/test';
import { loginAndReachProducts, reachProductsPage } from './helpers';

test.setTimeout(60_000);

// The wordmark image (accessibilityLabel="Relab") is rendered by both the
// TopNav brand pressable and the native stack header's headerTitle — never
// both at once for a TopNav-covered screen. A count of 1 is the regression
// net for hideForTopNav failing to apply.
const WORDMARK_IMAGE_NAME = /Relab/;
// HeaderRightPill's accessible name, from either TopNav or the stack header.
const HEADER_PILL_NAME = /^(Sign in|Account: .+)$/;
const CAMERAS_URL_PATTERN = /cameras/;

test.describe('Top nav (>=lg)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('renders Products and Cameras, marks the active destination, and navigates on click', async ({
    page,
  }) => {
    await loginAndReachProducts(page);

    // The brand pressable is the TopNav-only landmark (the stack header's
    // wordmark has no such accessible name), so its presence proves the top
    // bar itself rendered.
    await expect(page.getByLabel('Relab, go to products')).toBeVisible();
    await expect(page.getByRole('img', { name: WORDMARK_IMAGE_NAME })).toHaveCount(1);

    await expect(page.getByRole('button', { name: 'Products, current page' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cameras' })).toBeVisible();

    await page.getByRole('button', { name: 'Cameras' }).click();
    await expect(page).toHaveURL(CAMERAS_URL_PATTERN, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Cameras, current page' })).toBeVisible();
  });

  test('does not duplicate the stack header on a screen the top nav covers', async ({ page }) => {
    await reachProductsPage(page);

    // HeaderRightPill is rendered once by TopNav and once (conditionally) by
    // the products stack header; hideForTopNav should keep exactly one alive.
    await expect(page.getByRole('button', { name: HEADER_PILL_NAME })).toHaveCount(1);
    await expect(page.getByRole('img', { name: WORDMARK_IMAGE_NAME })).toHaveCount(1);
  });
});

test.describe('Top nav (phone)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('top bar is absent; the stack header renders instead', async ({ page }) => {
    await reachProductsPage(page);

    await expect(page.getByLabel('Relab, go to products')).not.toBeVisible();
    // The stack header still shows the wordmark and the header pill — exactly
    // once, from the stack header alone (TopNav renders null below lg).
    await expect(page.getByRole('img', { name: WORDMARK_IMAGE_NAME })).toHaveCount(1);
    await expect(page.getByRole('button', { name: HEADER_PILL_NAME })).toHaveCount(1);
  });
});
