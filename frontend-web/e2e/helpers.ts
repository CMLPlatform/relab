import { expect, type Page } from '@playwright/test';

const CANONICAL_URL_PATTERN = /^https?:\/\/(localhost:8081|cml-relab\.org)(\/.*)?$/;

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

export async function expectContentPage(page: Page) {
  await expect(page.locator('.content-page.content-page-compact')).toBeVisible();
}
