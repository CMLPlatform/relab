import { expect, type Locator, type Page } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'E2eTestPass123!';
const PRODUCTS_URL_PATTERN = /products/;
const ONBOARDING_OR_PRODUCTS_URL_PATTERN = /onboarding|products/;
const PROFILE_URL_PATTERN = /profile/;
const SEEDED_PRODUCT_NAME_PATTERN = /^(Dell XPS 13|iPhone 12)$/;
const PRODUCT_DETAIL_URL_PATTERN = /products\/\d+/;
const VIEW_IMAGE_LABEL_PATTERN = /^View image \d+$/;
const makeProductDetailUrlPattern = (id: number) => new RegExp(`/products/${id}$`);
const DISMISS_BUTTON_NAMES = ['Got it', 'Maybe later', 'Continue'] as const;

function makeOnboardingUsername() {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Pre-dismiss the guest welcome card via localStorage so it never renders.
 * Must be called before any goto() on this page. The key matches
 * GUEST_INFO_CARD_STORAGE_KEY in useProductsWelcomeCard.ts.
 */
async function suppressGuestWelcomeCard(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('products_info_card_dismissed_guest', 'true');
    } catch {
      // Non-fatal: some contexts (e.g. opaque origin) forbid localStorage.
    }
  });
}

export async function dismissProductsInfoCard(page: Page) {
  // Fallback dismissal for authenticated users (whose preference lives server-side).
  const welcomeHeading = page.getByText('Welcome to RELab', { exact: true });
  const appeared = await welcomeHeading.isVisible({ timeout: 1_000 }).catch(() => false);
  if (!appeared) return;

  for (const name of DISMISS_BUTTON_NAMES) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
      await button.click();
      await expect(welcomeHeading).not.toBeVisible({ timeout: 5_000 });
      return;
    }
  }
}

export async function reachProductsPage(page: Page) {
  await suppressGuestWelcomeCard(page);
  await page.goto('/products');
  await dismissProductsInfoCard(page);
  await expect(page.getByPlaceholder('Search products')).toBeVisible({
    timeout: 15_000,
  });
}

export async function finishOnboardingIfVisible(page: Page) {
  if (!page.url().includes('onboarding')) {
    return;
  }

  const usernameInput = page.getByPlaceholder('e.g. awesome_user');
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  await usernameInput.fill(makeOnboardingUsername());
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(PRODUCTS_URL_PATTERN, { timeout: 30_000 });
}

export async function loginAndReachProducts(page: Page) {
  await suppressGuestWelcomeCard(page);
  await page.goto('/login');
  await page.getByPlaceholder('Email or username').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(ONBOARDING_OR_PRODUCTS_URL_PATTERN, { timeout: 30_000 });
  await finishOnboardingIfVisible(page);
  await dismissProductsInfoCard(page);
  await expect(page.getByPlaceholder('Search products')).toBeVisible({
    timeout: 10_000,
  });
}

export async function loginAndGoToProfile(page: Page) {
  await loginAndReachProducts(page);
  await page.goto('/profile');
  await expect(page).toHaveURL(PROFILE_URL_PATTERN, { timeout: 10_000 });
}

export async function openProductCreationDialog(page: Page) {
  await page.getByRole('button', { name: 'Create new product' }).click();
  await expect(page.getByText('Create New Product')).toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Click an RN Paper Menu anchor and wait for items to mount. Retries on
 * failure: under parallel-worker CPU load, Paper's initial layout measurement
 * can return zero dimensions, leaving the Portal in "not rendered" state — a
 * second click triggers a fresh measurement and typically succeeds.
 */
export async function openMenu(page: Page, anchor: Locator) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await anchor.click();
    try {
      await page.locator('[role="menuitem"]').first().waitFor({
        state: 'attached',
        timeout: 3_000,
      });
      return;
    } catch {
      // Menu didn't render; press Escape to clear any stuck Portal state, then retry.
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  throw new Error('Menu anchor did not open a menu after 3 attempts');
}

export async function selectMenuItem(page: Page, label: string) {
  // RN Paper menus do a two-phase Portal render: items briefly attach off-screen
  // for measurement, detach, then re-attach at the correct position. Playwright's
  // async waitFor + evaluate can't bridge that window reliably. waitForFunction
  // polls entirely in-browser so find + click is atomic with no JS-round-trip gap.
  //
  // We scan by title text *and* by the accessible menuitem name, because RN Paper
  // renders the title in a non-clickable child and the menuitem role on an
  // ancestor TouchableRipple. Clicking the ancestor is more reliable than
  // clicking the text node directly.
  await page.waitForFunction(
    (targetLabel) => {
      const items = Array.from(
        document.querySelectorAll('[role="menuitem"]'),
      ) as HTMLElement[];
      const el = items.find((node) => node.textContent?.trim() === targetLabel);
      if (!el) return false;
      el.click();
      return true;
    },
    label,
    { timeout: 15_000, polling: 50 },
  );
}

export async function openSeededProductFromProductsPage(page: Page) {
  const seededProduct = page.getByText(SEEDED_PRODUCT_NAME_PATTERN).first();
  await expect(seededProduct).toBeVisible({ timeout: 10_000 });
  await seededProduct.click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 10_000 });
}

export async function openProductDetail(page: Page, id: number) {
  await page.goto(`/products/${id}`);
  await expect(page).toHaveURL(makeProductDetailUrlPattern(id), {
    timeout: 10_000,
  });
}

export async function openProductByNameFromProductsPage(page: Page, name: string) {
  const product = page.getByText(name, { exact: true }).first();
  await expect(product).toBeVisible({ timeout: 15_000 });
  await product.click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });
  // Wait for the product detail page to fully load
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
}

export async function openGalleryLightbox(page: Page) {
  const productImageTrigger = page.getByLabel(VIEW_IMAGE_LABEL_PATTERN).first();
  await expect(productImageTrigger).toBeVisible({ timeout: 10_000 });
  await productImageTrigger.click({ force: true });
  await expect(page.getByLabel('Close lightbox')).toBeVisible({
    timeout: 10_000,
  });
}

export { EMAIL, PASSWORD };
