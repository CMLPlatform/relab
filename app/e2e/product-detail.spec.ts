/**
 * Product detail page E2E tests.
 *
 * Covers: creating a new product via capture-first creation (name → Create),
 * verifying the detail page loads in edit mode, editing fields, and the
 * unsaved-changes guard.
 *
 * The test user (e2e-admin) is a verified superuser, so the "Create New
 * Product" dialog is always accessible without the email-verification gate.
 */

import { expect, test } from '@playwright/test';
import {
  loginAndReachProducts,
  openNewProductPage,
  openSeededProductFromProductsPage,
  reachProductsPage,
} from './helpers';

test.setTimeout(60_000);

const SEEDED_PRODUCT_NAME_PATTERN = /^(Dell XPS 13|iPhone 12)$/;
const PRODUCT_DETAIL_URL_PATTERN = /products\/\d+/;
const PRODUCTS_LIST_URL_PATTERN = /\/products$|\/products\?/;
// The header back affordance is a Pressable (accessibilityRole="button", label "Go back"),
// not a link — see HeaderBackButton.
const BACK_CONTROL_NAME_PATTERN = /back/i;
// Empty optional sections collapse to a single "Add …" row in edit mode
// (Section.tsx showAddRow); pressing it reveals the real fields.
const ADD_DESCRIPTION_LABEL = 'Add a description';
const ADD_PHYSICAL_PROPERTIES_LABEL = 'Add physical properties';
const ADD_CIRCULARITY_NOTES_LABEL = 'Add circularity notes';
const DESCRIPTION_PLACEHOLDER = 'Add a product description';

// Stage 1 of capture-first creation: fill the name on the capture screen and
// press Create. The backend saves immediately and the app redirects to the
// new product's detail page in edit mode (?edit=1) — granular capture-form
// validation (short names, Create disabled/enabled) is unit-tested on
// CaptureScreen itself; this only proves the real navigation round-trip.
async function createProduct(page: import('@playwright/test').Page, name: string): Promise<void> {
  await openNewProductPage(page);
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });
}

// Stage 2: detail-in-edit. The product already exists at this point, so this
// is an ordinary existing-record edit — same "Add …" row pattern as any other
// empty section (see the 2a add-row coverage below).
async function fillRequiredProductFields(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  await createProduct(page, name);
  await page.getByRole('button', { name: ADD_PHYSICAL_PROPERTIES_LABEL }).click();
  const weightInput = page.getByPlaceholder('> 0').first();
  await weightInput.fill('42');
  await weightInput.blur();
}

async function saveNewProduct(page: import('@playwright/test').Page, name: string): Promise<void> {
  await fillRequiredProductFields(page, name);
  await expect(page.getByRole('button', { name: 'Save Product' })).toBeEnabled({
    timeout: 5_000,
  });
  await page.getByRole('button', { name: 'Save Product' }).click();
}

// ─── Product detail navigation ─────────────────────────────────────────────────

test.describe('Product detail: navigation', () => {
  test('clicking a product card navigates to the detail page', { tag: '@cross-browser' }, async ({
    page,
  }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
  });

  test('product detail page shows the product name in the header', async ({ page }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
    await expect(
      page.getByRole('heading', { name: SEEDED_PRODUCT_NAME_PATTERN }).last(),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Section nav anchors ────────────────────────────────────────────────────
// Regression net for the section-anchor coordinate bug: Section registered
// its onLayout y relative to its parent View, not the scroll content, so
// chip taps landed roughly one section short (missing the gallery height).
test.describe('Product detail: section navigation', () => {
  test('clicking the Physical properties chip scrolls that section to the top of the viewport', async ({
    page,
  }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);

    // Both seeded products have physical properties set, so the section (and
    // its nav chip/outline entry) is visible in view mode without editing.
    await page.getByRole('button', { name: 'Physical properties' }).click();

    // The chip/outline entry and the Section heading share the same text; the
    // Section heading is the last match in DOM order (nav renders first).
    const heading = page.getByText('Physical properties', { exact: true }).last();
    await expect(heading).toBeVisible({ timeout: 5_000 });
    // Poll: scrollTo animates, so the heading needs a moment to settle near
    // the viewport top. Pre-fix it landed ~a full section short (y >> 200).
    await expect
      .poll(async () => (await heading.boundingBox())?.y ?? Number.POSITIVE_INFINITY, {
        timeout: 5_000,
      })
      .toBeLessThan(200);
  });
});

// ─── Product creation flow ─────────────────────────────────────────────────────
// Capture-form-level validation (short names, Create disabled/enabled, 100-char
// behavior) is unit-tested on CaptureScreen; these only prove the real
// capture → detail round-trip through the app and backend.

test.describe('Product creation', () => {
  test('creating a product via capture lands on its saved detail page in edit mode', {
    tag: ['@cross-browser', '@auth'],
  }, async ({ page }) => {
    await loginAndReachProducts(page);
    const productName = `E2E Test ${Date.now()}`;
    await createProduct(page, productName);

    // In edit mode the header *is* the name field (a textbox), not a
    // static heading — see productPageHelpers.tsx's useProductPageHeader.
    await expect(page.getByRole('textbox', { name: 'Product name' })).toHaveValue(productName, {
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Save Product' })).toBeVisible();
  });

  test('discarding the capture draft returns to the products page', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await page.getByRole('textbox', { name: 'Name' }).fill('Discard me');
    // Unlike the detail screen (a custom Pressable back button), the capture
    // screen uses expo-router's default web back control, which renders as a
    // link rather than a button.
    await page.getByRole('link', { name: BACK_CONTROL_NAME_PATTERN }).click();
    await expect(page.getByText('Discard changes?')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(PRODUCTS_LIST_URL_PATTERN, {
      timeout: 10_000,
    });
  });

  test('saving physical properties on a freshly created product persists them', async ({
    page,
  }) => {
    await loginAndReachProducts(page);
    await saveNewProduct(page, `E2E Test ${Date.now()}`);

    await expect(page.getByRole('button', { name: 'Physical properties' })).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── Product detail edit mode ──────────────────────────────────────────────────
// Carried over from 2a-T7 almost verbatim: once a product exists (whether just
// created via capture or opened from the list) its detail-in-edit behavior —
// collapsed "Add …" rows, the unsaved-changes guard — is identical.

test.describe('Product detail: edit mode', () => {
  test('a freshly created product opens in edit mode with collapsed optional sections', async ({
    page,
  }) => {
    await loginAndReachProducts(page);
    await createProduct(page, `E2E Test ${Date.now()}`);

    // A fresh product's optional sections are all empty, so they collapse to a
    // single "Add …" row (Section.tsx showAddRow) instead of their full
    // content. Assert the row for Overview, then press it to prove it
    // actually reveals the description field.
    const addDescriptionRow = page.getByRole('button', { name: ADD_DESCRIPTION_LABEL });
    await expect(addDescriptionRow).toBeVisible({ timeout: 10_000 });
    await addDescriptionRow.click();
    await expect(page.getByPlaceholder(DESCRIPTION_PLACEHOLDER)).toBeVisible({
      timeout: 5_000,
    });

    // Other empty sections stay collapsed but present.
    await expect(page.getByRole('button', { name: ADD_PHYSICAL_PROPERTIES_LABEL })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: ADD_CIRCULARITY_NOTES_LABEL })).toBeVisible({
      timeout: 5_000,
    });
    // Metadata is never empty, so it always renders in full.
    await expect(page.getByText('Metadata')).toBeVisible({ timeout: 5_000 });
  });

  test('unsaved-changes guard blocks navigation mid-edit', async ({ page }) => {
    await loginAndReachProducts(page);
    await createProduct(page, `E2E Test ${Date.now()}`);

    // Overview is empty on a fresh product, so the description field sits
    // behind the "Add a description" row until pressed.
    await page.getByRole('button', { name: ADD_DESCRIPTION_LABEL }).click();
    const descriptionInput = page.getByPlaceholder(DESCRIPTION_PLACEHOLDER);
    await expect(descriptionInput).toBeVisible({ timeout: 10_000 });
    // Make the form dirty so the unsaved-changes guard fires (form starts pristine after creation)
    await descriptionInput.fill('test description');

    // Attempt to leave via the in-app header back control; the unsaved-changes guard should intercept.
    await page.getByRole('button', { name: BACK_CONTROL_NAME_PATTERN }).click();
    await expect(page.getByText('Discard changes?')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: "Don't leave" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();

    // Choose "Don't leave"; stays on the product page
    await page.getByRole('button', { name: "Don't leave" }).click();
    await expect(page.getByText('Discard changes?')).not.toBeVisible();
    await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN);
  });
});
