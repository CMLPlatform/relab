import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const CANONICAL_URL_PATTERN =
  /^https?:\/\/((127\.0\.0\.1|localhost):(8013|18013)|cml-relab\.org)(\/.*)?$/;
const HERO_HEADLINE = 'Open product data for circular-economy research';
const HERO_LEAD_PATTERN = /every component named, weighed and photographed/i;

export const BROWSE_RECORDS_LINK_NAME = 'Browse the records';
export const CONTRIBUTE_LINK_NAME = 'Contribute a teardown';

// Aligned across www/docs/app: WCAG 2.0-2.2, level A + AA — the stated target.
// target-size (2.5.8) is the only 2.2-only rule axe-core ships; 2.4.11 and
// 2.4.13 have no axe coverage and are verified by hand.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

export async function analyzeAccessibility(page: Page) {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    `,
  });

  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

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

  await expect(main.getByRole('heading', { name: HERO_HEADLINE, level: 1 })).toBeVisible();
  await expect(main.getByText(HERO_LEAD_PATTERN)).toBeVisible();
  await expect(main.getByRole('link', { name: BROWSE_RECORDS_LINK_NAME })).toBeVisible();
  await expect(main.getByRole('link', { name: CONTRIBUTE_LINK_NAME })).toBeVisible();
}

export async function expectContentPage(page: Page) {
  await expect(page.locator('.content-page')).toBeVisible();
}
