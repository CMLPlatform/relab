import { expect, type Page, test } from '@playwright/test';
import { expectCanonicalUrl, expectThemeToggle } from './helpers.ts';

const HOMEPAGE_TITLE_PATTERN = /RELab/i;
const META_TITLE_PATTERN = /RELab/i;
const META_DESCRIPTION_PATTERN = /open-source research platform/i;
const CAPABILITY_CARD_COUNT = 4;
const OPEN_APP_LINK_NAME = /open( the)? app/i;
const READ_DOCS_LINK_NAME = /read( the)? docs|read docs/i;
const BROWSE_GITHUB_LINK_NAME = /browse github/i;
const FOLLOW_LINKEDIN_LINK_NAME = /follow linkedin/i;

async function expectCoreHomepageSections(page: Page) {
  const capabilityGrid = page.locator('.capability-grid');
  const workflowSection = page.locator('.workflow-shell');
  const trustSection = page.locator('.trust-shell');
  const followSection = page.locator('.follow-shell');

  await expect(page.getByRole('heading', { name: 'What you can do', level: 2 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'How RELab fits the workflow', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Built in a research context', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Follow public updates', level: 2 }),
  ).toBeVisible();
  await expect(capabilityGrid.locator('article')).toHaveCount(CAPABILITY_CARD_COUNT);
  await expect(workflowSection).toContainText('Capture');
  await expect(workflowSection).toContainText('Document');
  await expect(workflowSection).toContainText('Analyse');
  await expect(trustSection.getByRole('link', { name: READ_DOCS_LINK_NAME })).toBeVisible();
  await expect(followSection.getByRole('link', { name: BROWSE_GITHUB_LINK_NAME })).toBeVisible();
  await expect(followSection.getByRole('link', { name: FOLLOW_LINKEDIN_LINK_NAME })).toBeVisible();
}

test.describe('Landing page', () => {
  test('renders the homepage shell and core links @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(HOMEPAGE_TITLE_PATTERN);
    await expect(
      page.getByRole('heading', {
        name: 'Reverse Engineering Lab',
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: OPEN_APP_LINK_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: READ_DOCS_LINK_NAME }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: BROWSE_GITHUB_LINK_NAME }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
    await expect(page.locator('.brand-mark')).toBeVisible();
    await expectThemeToggle(page);
  });

  test('renders the homepage content sections and metadata', async ({ page }) => {
    await page.goto('/');
    const backdrop = page.locator('.site-backdrop');
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS('position', 'fixed');
    await expectCoreHomepageSections(page);
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
