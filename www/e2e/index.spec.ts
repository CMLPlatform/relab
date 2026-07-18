import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectHomepageHero, expectThemeToggle } from './helpers.ts';

const HOMEPAGE_TITLE_PATTERN = /Relab/i;
const META_TITLE_PATTERN = /Relab/i;
const META_DESCRIPTION_PATTERN = /open-source research platform/i;
// The hero CTA and the 9R source citation; header/footer links sit outside <main>.
const HOMEPAGE_MAIN_LINK_COUNT = 2;

test.describe('Landing page', () => {
  test('renders the homepage shell, core links, and metadata @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(HOMEPAGE_TITLE_PATTERN);
    await expectHomepageHero(page);
    await expect(page.getByRole('link', { name: 'Relab home' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the Relab privacy policy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'YouTube' })).toBeVisible();
    await expectThemeToggle(page);

    const backdrop = page.locator('.site-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS('position', 'fixed');
    await expect(page.locator('main').getByRole('link')).toHaveCount(HOMEPAGE_MAIN_LINK_COUNT);
    await expectCanonicalUrl(page, '/');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      META_TITLE_PATTERN,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      META_DESCRIPTION_PATTERN,
    );
    await expect(page.locator('meta[name="theme-color"][data-dynamic-theme]')).toHaveCount(1);
  });

  test('ships no inline scripts, matching the production CSP @smoke', async ({ page }) => {
    // The Caddy CSP is script-src 'self' with no 'unsafe-inline' and no hashes,
    // so any inline <script> in the build would be silently dead in production.
    await page.goto('/');
    await expect(page.locator('script:not([src])')).toHaveCount(0);
  });

  test('keeps the theme toggle at the right edge of the footer on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const footerLinks = page.locator('.footer-links');
    const footerTheme = page.locator('.footer-theme');
    const linksBox = await footerLinks.boundingBox();
    const themeBox = await footerTheme.boundingBox();

    expect(linksBox).not.toBeNull();
    expect(themeBox).not.toBeNull();
    expect(themeBox?.x).toBeGreaterThan(linksBox?.x ?? 0);
    await expect(footerTheme).toHaveCSS('border-left-style', 'solid');
  });
});
