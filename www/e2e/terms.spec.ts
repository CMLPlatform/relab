import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectContentPage } from './helpers.ts';

const TERMS_TITLE = /Terms/;

test('terms page renders and is linked from the footer', async ({ page }) => {
  await page.goto('/terms');
  await expect(page).toHaveTitle(TERMS_TITLE);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'The licence you give us',
    'How we license it onwards',
    'What you promise',
    'Credit',
    'Published releases cannot be taken back',
  ]);
  await expectContentPage(page);
  await expect(page.getByRole('link', { name: 'Read the Relab terms of use' })).toBeVisible();
  // Astro's directory build format emits trailing-slash canonicals.
  await expectCanonicalUrl(page, '/terms/');
});
