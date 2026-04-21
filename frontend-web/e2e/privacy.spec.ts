import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectContentPage } from './helpers.ts';

const PRIVACY_TITLE = /Privacy/;

test('privacy page renders', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveTitle(PRIVACY_TITLE);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectContentPage(page);
  await expectCanonicalUrl(page, '/privacy/');
});
