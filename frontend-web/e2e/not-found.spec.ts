import { expect, test } from '@playwright/test';

test('unknown route returns 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
});
