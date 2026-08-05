/**
 * The critical journey, chained in one run.
 *
 * The rest of the suite covers these steps as fragments, each starting from a
 * fresh login as the seeded superuser. That never proves the steps compose, and
 * never proves an ordinary contributor can do them: `e2e-admin` is a superuser,
 * so it passes every ownership and permission check by construction. This runs
 * as `alice`, a seeded verified non-superuser.
 *
 * Registration is deliberately NOT chained in here. A password signup is created
 * unverified, and creating a product requires a verified account
 * (`createProductAction`). The E2E stack has no mail transport, the verification
 * token is a stateless JWT that never leaves the API process, and `is_verified`
 * is intentionally not settable through the admin API (`NoPublicAccountControls`
 * on `UserUpdate`). So there is no way to verify a fresh account from a browser
 * test today — `auth.spec.ts` covers registration up to the verify-email prompt,
 * and this picks up from an already-verified account.
 */

import { expect, test } from '@playwright/test';
import {
  dismissProductsInfoCard,
  loginAndReachProducts,
  openNewProductPage,
  SEEDED_MEMBER,
  suppressGuestWelcomeCard,
} from './helpers';

test.setTimeout(120_000);

const PRODUCT_DETAIL_URL_PATTERN = /products\/\d+/;
const SAVED_PRODUCT_URL_PATTERN = /\/products\/\d+$/;
const COMPONENT_DETAIL_URL_PATTERN = /components\/\d+/;
const NEW_COMPONENT_URL_PATTERN = /\/products\/\d+\/components\/new$/;
const BACK_CONTROL_NAME_PATTERN = /back/i;
const URL_QUERY_STRING_PATTERN = /\?.*$/;
const PRODUCT_IMAGE_UPLOAD_PATH_PATTERN = /\/v1\/products\/\d+\/images$/;

test('an ordinary member can create, populate and publish a product', async ({ page, browser }) => {
  const stamp = Date.now();
  const productName = `Journey ${stamp}`;
  const componentName = `Journey Part ${stamp}`;

  await loginAndReachProducts(page, SEEDED_MEMBER);

  // ── Create ──────────────────────────────────────────────────────────────
  await openNewProductPage(page);
  await page.getByRole('textbox', { name: 'Name' }).fill(productName);
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });
  const productUrl = page.url().replace(URL_QUERY_STRING_PATTERN, '');

  // ── Populate: a required dimension and a real image ──────────────────────
  await page.getByRole('button', { name: 'Add physical properties' }).click();
  const weight = page.getByPlaceholder('> 0').first();
  await weight.fill('42');
  await weight.blur();

  const storedImages = page.locator('img[src*="/uploads/"]');
  const before = new Set(
    await storedImages.evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src)),
  );

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Add photos from gallery' }).click(),
  ]);
  await chooser.setFiles('e2e/fixtures/test-image.png');
  // setFiles returns before the app has read the file into the form. Saving
  // first would persist a product with no images and never issue the upload.
  await expect(page.getByRole('button', { name: `View ${productName}` })).toBeVisible({
    timeout: 20_000,
  });

  // Picking stages the file; Save is what uploads it.
  const [upload] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && PRODUCT_IMAGE_UPLOAD_PATH_PATTERN.test(r.url()),
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: 'Save Product' }).click(),
  ]);
  expect(upload.status()).toBeLessThan(300);

  // ── Compose: a child component ──────────────────────────────────────────
  await expect(page).toHaveURL(SAVED_PRODUCT_URL_PATTERN, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Add component' }).click();
  // Wait for the capture screen rather than assuming it. The press is
  // occasionally swallowed at the navigation layer under parallel load — see
  // product-detail.spec.ts — and without this the failure surfaces much later
  // against a button that only exists on the screen we never reached.
  await expect(page).toHaveURL(NEW_COMPONENT_URL_PATTERN, { timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Name' }).fill(componentName);
  await page.getByRole('button', { name: 'Create component' }).click();
  await expect(page).toHaveURL(COMPONENT_DETAIL_URL_PATTERN, { timeout: 15_000 });

  await page.getByRole('button', { name: BACK_CONTROL_NAME_PATTERN }).click();
  await expect(page).toHaveURL(SAVED_PRODUCT_URL_PATTERN, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: componentName, exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // ── Publish: reachable without the session that created it ──────────────
  // The whole point of the platform is that the record is public. Everything
  // above ran with alice's cookie; a brand-new context has none.
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await suppressGuestWelcomeCard(guest);
    await guest.goto(productUrl);
    await dismissProductsInfoCard(guest);

    await expect(guest.getByText(productName).first()).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByText(componentName).first()).toBeVisible({ timeout: 20_000 });

    // Pin down that this really is an anonymous visitor. Without it the whole
    // guest block would keep passing if the context ever inherited a session.
    await expect(guest.getByRole('button', { name: 'Edit Product' })).toBeHidden();

    // The image must be served to an anonymous visitor too, not just rendered
    // from the authenticated session's cache.
    const guestImages = guest.locator('img[src*="/uploads/"]');
    await expect(guestImages.first()).toBeAttached({ timeout: 20_000 });
    const srcs = await guestImages.evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).src),
    );
    const uploaded = srcs.find((src) => !before.has(src));
    expect(uploaded).toBeTruthy();
    expect((await guest.request.get(uploaded as string)).status()).toBe(200);
  } finally {
    await guestContext.close();
  }
});
