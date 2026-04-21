import { expect, type Page } from '@playwright/test';

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

export async function dismissProductsInfoCard(page: Page) {
  const buttons = DISMISS_BUTTON_NAMES.map((buttonName) => ({
    button: page.getByRole('button', { name: buttonName }),
    buttonName,
  }));
  const visibility = await Promise.all(
    buttons.map(async ({ button }) => button.isVisible({ timeout: 1_000 }).catch(() => false)),
  );
  const visibleButton = buttons[visibility.findIndex(Boolean)]?.button;

  if (visibleButton) {
    await visibleButton.click();
  }
}

export async function reachProductsPage(page: Page) {
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

export async function selectMenuItem(page: Page, label: string) {
  const labelNode = page.getByText(label, { exact: true }).last();
  await expect(labelNode).toBeVisible({ timeout: 5_000 });

  const menuItem = labelNode.locator('xpath=ancestor::*[@role="button" or @role="menuitem"][1]');
  if ((await menuItem.count()) > 0) {
    await menuItem.scrollIntoViewIfNeeded();
    await menuItem.click({ force: true });
    return;
  }

  await labelNode.scrollIntoViewIfNeeded();
  await labelNode.click({ force: true });
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
