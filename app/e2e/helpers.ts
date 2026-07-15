import { expect, type Locator, type Page } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'E2eTestPass123!';
const PRODUCTS_URL_PATTERN = /products/;
const ONBOARDING_OR_PRODUCTS_URL_PATTERN = /onboarding|products/;
const PROFILE_URL_PATTERN = /account/;
const NEW_PRODUCT_URL_PATTERN = /\/products\/new$/;
const SEEDED_PRODUCT_NAME_PATTERN = /^(Dell XPS 13|iPhone 12)$/;
const PRODUCT_DETAIL_URL_PATTERN = /products\/\d+/;
const VIEW_IMAGE_LABEL_PATTERN = /^View image \d+$/;
const DISMISS_BUTTON_NAMES = ['Got it', 'Maybe later', 'Continue'] as const;
// The menu is an RN-core Modal (Menu.tsx) that measures its anchor position on
// open; under parallel-worker CPU load an open can occasionally land before the
// items lay out. Each attempt is an independent chance at a clean open, so a
// generous budget keeps first-pass reliability high without full-test retries.
const MENU_OPEN_ATTEMPTS = 8;

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
  const welcomeHeading = page.getByText('Welcome to Relab', { exact: true });
  const appeared = await welcomeHeading.isVisible({ timeout: 1_000 }).catch(() => false);
  if (!appeared) return;

  for (const name of DISMISS_BUTTON_NAMES) {
    const button = page.getByRole('button', { name, exact: true });
    // biome-ignore lint/performance/noAwaitInLoops: probe dismiss buttons in order; first visible wins.
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
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(ONBOARDING_OR_PRODUCTS_URL_PATTERN, { timeout: 30_000 });
  await finishOnboardingIfVisible(page);
  await dismissProductsInfoCard(page);
  await expect(page.getByPlaceholder('Search products')).toBeVisible({
    timeout: 10_000,
  });
}

export async function loginAndGoToProfile(page: Page) {
  await loginAndReachProducts(page);
  await page.goto('/account');
  await expect(page).toHaveURL(PROFILE_URL_PATTERN, { timeout: 10_000 });
}

export async function openNewProductPage(page: Page) {
  await page.getByRole('button', { name: 'Create new product' }).click();
  await expect(page).toHaveURL(NEW_PRODUCT_URL_PATTERN, {
    timeout: 10_000,
  });
  // Capture-first creation screen: a bare Name field, not the old full form.
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Click a menu anchor and wait for items to mount. Retries on failure: under
 * parallel-worker CPU load the Modal's open can briefly attach items before the
 * anchor-position measurement settles — a second click re-opens and typically
 * succeeds.
 */
export async function openMenu(page: Page, anchor: Locator) {
  // Ensure the anchor is attached and actionable before we start dispatching clicks.
  await anchor.waitFor({ state: 'visible', timeout: 10_000 });

  for (let attempt = 0; attempt < MENU_OPEN_ATTEMPTS; attempt++) {
    // Alternate click strategies: Playwright's trusted click first, then a
    // synthetic DOM click via element.click(). The anchor's IconButton
    // occasionally drops the first pointer event under parallel-worker CPU
    // load; a direct element.click() bypasses any pointer-events quirks.
    // biome-ignore lint/performance/noAwaitInLoops: sequential retry — each attempt must observe the previous one's outcome.
    await (attempt % 2 === 0
      ? anchor.click({ force: true })
      : anchor.evaluate((el) => (el as HTMLElement).click()));
    try {
      // Poll in-browser for attached menu items. The menu Modal can briefly
      // attach items before layout settles; attachment is the earliest reliable
      // signal that onPress fired and the menu mounted.
      // In-browser polling at 50ms is fast enough to catch the window before
      // measurement tears items down; Playwright's network-hop locator polling
      // is too slow and would cause us to press Escape on a menu that just opened.
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="menu-item-title"]').length > 0,
        null,
        { timeout: 2_500, polling: 50 },
      );
      return;
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  throw new Error(`Menu anchor did not open a menu after ${MENU_OPEN_ATTEMPTS} attempts`);
}

/**
 * Open a menu via its anchor and click the item with the given label.
 * Combining open + select into one retried operation is required because the
 * menu can dismiss itself between separate calls (a stray pointer event on the
 * Modal backdrop closes it). We retry the full sequence until the item is
 * clicked or we exhaust attempts.
 */
export async function selectMenuItem(page: Page, anchor: Locator, label: string) {
  await anchor.waitFor({ state: 'visible', timeout: 10_000 });

  for (let attempt = 0; attempt < MENU_OPEN_ATTEMPTS; attempt++) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential retry.
    await (attempt % 2 === 0
      ? anchor.click({ force: true })
      : anchor.evaluate((el) => (el as HTMLElement).click()));

    try {
      await page.waitForFunction(
        (targetLabel) => {
          const titles = Array.from(
            document.querySelectorAll('[data-testid="menu-item-title"]'),
          ) as HTMLElement[];
          const titleNode = titles.find((node) => node.textContent?.trim() === targetLabel);
          if (!titleNode) return false;
          const clickable = (titleNode.closest('[role="menuitem"]') ?? titleNode) as HTMLElement;
          clickable.click();
          return true;
        },
        label,
        { timeout: 3_500, polling: 50 },
      );
      return;
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  throw new Error(
    `Could not open menu and click item "${label}" after ${MENU_OPEN_ATTEMPTS} attempts`,
  );
}

export async function openSeededProductFromProductsPage(page: Page) {
  const seededProduct = page.getByText(SEEDED_PRODUCT_NAME_PATTERN).first();
  await expect(seededProduct).toBeVisible({ timeout: 10_000 });
  await seededProduct.click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 10_000 });
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
