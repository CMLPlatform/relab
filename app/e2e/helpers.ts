import { expect, type Locator, type Page } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'E2eTestPass123!';
const PRODUCTS_URL_PATTERN = /products/;
const ONBOARDING_OR_PRODUCTS_URL_PATTERN = /onboarding|products/;
const PROFILE_URL_PATTERN = /account/;
const NEW_PRODUCT_URL_PATTERN = /\/products\/new$/;
// One specific seeded product rather than "either of two": the lookup searches
// for it by name, which needs an exact term.
const SEEDED_PRODUCT_NAME = 'Dell XPS 13';
const PRODUCT_DETAIL_URL_PATTERN = /products\/\d+/;
// The gallery trigger is labelled `View ${altText}` (ProductImageGalleryContent),
// where altText is the image's description or the product name — never the
// literal "image N" this used to match, so the lightbox tests could not find it.
const VIEW_IMAGE_LABEL_PATTERN = /^View .+/;
// ProductsWelcomeCard's dismiss affordance: "Maybe later" for guests, "Got it"
// once signed in. "Continue" covers the onboarding variant.
const WELCOME_CARD_DISMISS_PATTERN = /^(Got it|Maybe later|Continue)$/;
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
export async function suppressGuestWelcomeCard(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('products_info_card_dismissed_guest', 'true');
    } catch {
      // Non-fatal: some contexts (e.g. opaque origin) forbid localStorage.
    }
  });
}

export async function dismissProductsInfoCard(page: Page) {
  // Fallback dismissal for authenticated users (whose preference lives server-side,
  // so the localStorage suppression above can't reach them).
  //
  // Keyed on the dismiss button, not the card's title: ProductsWelcomeCard shows
  // three different titles (guest / verified / unverified) and matching one of
  // them silently no-ops for the other two, leaving the card covering the list.
  // The card also renders a beat after the search bar, so this waits rather than
  // probing once.
  const dismissButton = page
    .getByRole('button', { name: WELCOME_CARD_DISMISS_PATTERN })
    .filter({ visible: true })
    .first();

  if (!(await dismissButton.isVisible({ timeout: 5_000 }).catch(() => false))) return;

  await dismissButton.click();
  await expect(dismissButton).not.toBeVisible({ timeout: 5_000 });
}

export async function reachProductsPage(page: Page) {
  await suppressGuestWelcomeCard(page);
  await page.goto('/products');
  await dismissProductsInfoCard(page);
  await expect(page.getByPlaceholder('Search products')).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * The sort/filter chips (Sort, Mine, Date, Brand, Type) sit behind one
 * "Filters" toggle beside the search bar; it opens by itself only when the URL
 * already carries a filter. Idempotent: leaves an open row alone.
 */
export async function openProductFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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

/**
 * A seeded, verified, NON-superuser account (see backend dummy_data.json).
 * Use it where the point is that an ordinary contributor can do something —
 * `e2e-admin` is a superuser and so proves less.
 */
export const SEEDED_MEMBER = { login: 'alice@example.com', password: 'fake_password_1' };

export async function loginAndReachProducts(
  page: Page,
  credentials: { login: string; password: string } = { login: EMAIL, password: PASSWORD },
) {
  await suppressGuestWelcomeCard(page);
  await page.goto('/login');
  // Auth fields are addressed by their visible label, not their placeholder:
  // the redesign moved the field name out of the placeholder (now an example
  // value, e.g. "you@university.edu") into a label that survives typing.
  await page.getByLabel('Email or username').fill(credentials.login);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
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
  await page.getByRole('button', { name: 'New product' }).click();
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

/**
 * Narrow the products list to one name before picking a row.
 *
 * Nothing clears the database between tests in a run — only teardown does
 * (`down -v`) — so every test that creates a product leaves it behind. Reading a
 * row straight off the rendered list therefore works until enough products
 * accumulate to push the target off the first page, at which point unrelated
 * tests start failing. Searching keeps the lookup independent of how much ran
 * before it.
 */
async function searchProducts(page: Page, name: string) {
  const search = page.getByPlaceholder('Search products');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(name);
  // The query is debounced and refetched, so the row is the settle signal.
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}

export async function openSeededProductFromProductsPage(page: Page) {
  await searchProducts(page, SEEDED_PRODUCT_NAME);
  const seededProduct = page.getByText(SEEDED_PRODUCT_NAME, { exact: true }).first();
  await seededProduct.click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 10_000 });
}

export async function openProductByNameFromProductsPage(page: Page, name: string) {
  await searchProducts(page, name);
  const product = page.getByText(name, { exact: true }).first();
  await product.click();
  await expect(page).toHaveURL(PRODUCT_DETAIL_URL_PATTERN, { timeout: 15_000 });
  // Wait for the product detail page to fully load
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
}

export async function openGalleryLightbox(page: Page) {
  const productImageTrigger = page.getByRole('button', { name: VIEW_IMAGE_LABEL_PATTERN }).first();
  await expect(productImageTrigger).toBeVisible({ timeout: 10_000 });
  await productImageTrigger.click({ force: true });
  await expect(page.getByLabel('Close lightbox')).toBeVisible({
    timeout: 10_000,
  });
}

export { EMAIL, PASSWORD };
