import { expect, test } from '@playwright/test';

test('unknown route returns 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/Page Not Found/);
  await expect(page.getByRole('heading', { name: 'That page is not here.' })).toBeVisible();
});
