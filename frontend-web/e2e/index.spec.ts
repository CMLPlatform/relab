import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectThemeToggle } from './helpers.ts';

const OPEN_APP_LINK_NAME = /open( the)? app/i;
const READ_DOCS_LINK_NAME = /read( the)? docs|read docs/i;
const BROWSE_GITHUB_LINK_NAME = /browse github/i;
const SUBSCRIBE_BUTTON_NAME = /subscribe/i;

test.describe('Landing page', () => {
  test('renders with correct title and core links', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Reverse Engineering Lab');
    await expect(
      page.getByRole('heading', {
        name: 'Reverse Engineering Lab',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: OPEN_APP_LINK_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: READ_DOCS_LINK_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: BROWSE_GITHUB_LINK_NAME })).toBeVisible();
  });

  test('renders the header brand and theme control', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(page.locator('.brand-mark')).toBeVisible();
    await expectThemeToggle(page);
  });

  test('renders the hero support links', async ({ page }) => {
    await page.goto('/');
    // hero text may vary; verify support links are available
    await expect(page.getByRole('link', { name: READ_DOCS_LINK_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: BROWSE_GITHUB_LINK_NAME })).toBeVisible();
  });

  test('renders the image-backed backdrop', async ({ page }) => {
    await page.goto('/');
    const backdrop = page.locator('.site-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS('position', 'fixed');
  });

  test('renders the newsletter signup section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stay in the loop', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: SUBSCRIBE_BUTTON_NAME })).toBeVisible();
  });

  test('publishes canonical and social metadata', async ({ page }) => {
    await page.goto('/');
    await expectCanonicalUrl(page, '/');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Reverse Engineering Lab',
    );
    await expect(page.locator('meta[name="theme-color"][data-dynamic-theme]')).toHaveCount(1);
  });
});
