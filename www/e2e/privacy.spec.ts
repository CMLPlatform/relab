import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectContentPage } from './helpers.ts';

const PRIVACY_TITLE = /Privacy/;
const GITHUB_AND_LINKEDIN_TEXT = /github and linkedin/i;

test('privacy page renders', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveTitle(PRIVACY_TITLE);
  await expect(page.getByRole('link', { name: 'Relab', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Account information',
    'Contributions',
    'AI and research use',
    'Your rights and choices',
  ]);
  await expectContentPage(page);
  await expect(page.getByText(GITHUB_AND_LINKEDIN_TEXT)).toBeVisible();
  // Astro's directory build format emits trailing-slash canonicals.
  await expectCanonicalUrl(page, '/privacy/');
});
