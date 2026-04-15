import { expect, test } from '@playwright/test';

test('core docs routes render and search UI is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Getting Started' })).toBeVisible();

  await page.goto('/architecture/system-design/');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'System Design' }).first(),
  ).toBeVisible();
});
