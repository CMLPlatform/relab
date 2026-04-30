import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectHomepageHero, expectThemeToggle } from './helpers.ts';

const HOMEPAGE_TITLE_PATTERN = /RELab/i;
const META_TITLE_PATTERN = /RELab/i;
const META_DESCRIPTION_PATTERN = /open-source research platform/i;
const HOMEPAGE_MAIN_LINK_COUNT = 3;

test.describe('Landing page', () => {
  test('renders the homepage shell and core links @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(HOMEPAGE_TITLE_PATTERN);
    await expectHomepageHero(page);
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.locator('.brand-mark')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Go to the homepage' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the RELab privacy policy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'YouTube' })).toBeVisible();
    await expectThemeToggle(page);
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

  test('renders the simplified homepage and metadata', async ({ page }) => {
    await page.goto('/');
    const backdrop = page.locator('.site-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS('position', 'fixed');
    await expectHomepageHero(page);
    await expect(page.locator('main').getByRole('link')).toHaveCount(HOMEPAGE_MAIN_LINK_COUNT);
    await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveCount(0);
    await expect(page.getByLabel('Email address')).toHaveCount(0);
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
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });
});
