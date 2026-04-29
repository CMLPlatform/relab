import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectContentPage } from './helpers.ts';

const PRIVACY_TITLE = /Privacy/;
const LEGACY_NEWSLETTER_SUBSCRIBERS_TEXT = /newsletter subscribers/i;
const GITHUB_AND_LINKEDIN_TEXT = /github and linkedin/i;

test('privacy page renders', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveTitle(PRIVACY_TITLE);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectContentPage(page);
  await expect(page.getByText(LEGACY_NEWSLETTER_SUBSCRIBERS_TEXT)).toHaveCount(0);
  await expect(page.getByText(GITHUB_AND_LINKEDIN_TEXT)).toBeVisible();
  await expectCanonicalUrl(page, '/privacy/');
});
