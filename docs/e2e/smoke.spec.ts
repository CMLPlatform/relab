import { expect, test } from '@playwright/test';

const SEARCH_BUTTON_NAME = /search/i;

test('core docs routes render and search UI is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: SEARCH_BUTTON_NAME })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Getting started', exact: true })).toBeVisible();

  await page.goto('/architecture/system-design/');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'System design' }).first(),
  ).toBeVisible();

  await page.goto('/operations/install/');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Installation and self-hosting' }).first(),
  ).toBeVisible();
});
