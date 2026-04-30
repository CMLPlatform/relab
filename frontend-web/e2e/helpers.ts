import { expect, type Page } from '@playwright/test';

const CANONICAL_URL_PATTERN = /^https?:\/\/((127\.0\.0\.1|localhost):8081|cml-relab\.org)(\/.*)?$/;
const HOMEPAGE_DESCRIPTION_PATTERN = /open-source research platform/i;
const OPEN_APP_ARIA_NAME = 'Open the RELab app';
const READ_DOCS_ARIA_NAME = 'Read the RELab documentation';
const BROWSE_SOURCE_ARIA_NAME = 'Browse the RELab source code on GitHub';

export async function expectCanonicalUrl(page: Page, expectedPath: string) {
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  const href = await canonical.getAttribute('href');
  expect(href).toMatch(CANONICAL_URL_PATTERN);

  const url = new URL(href ?? '');
  expect(url.pathname).toBe(expectedPath);
}

export async function expectThemeToggle(page: Page) {
  await expect(page.locator('[data-theme-toggle]')).toBeVisible();
}

export async function expectHomepageHero(page: Page) {
  const main = page.locator('main');

  await expect(
    main.getByRole('heading', { name: 'Reverse Engineering Lab', level: 1 }),
  ).toBeVisible();
  await expect(main.getByText(HOMEPAGE_DESCRIPTION_PATTERN)).toBeVisible();
  await expect(main.getByRole('link', { name: OPEN_APP_ARIA_NAME })).toBeVisible();
  await expect(main.getByRole('link', { name: READ_DOCS_ARIA_NAME })).toBeVisible();
  await expect(main.getByRole('link', { name: BROWSE_SOURCE_ARIA_NAME })).toBeVisible();
}

export async function expectContentPage(page: Page) {
  await expect(page.locator('.content-page.content-page-compact')).toBeVisible();
}
