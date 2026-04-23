import { expect, test } from '@playwright/test';

const NOT_FOUND_STATUS = 404;
const NOT_FOUND_TITLE = /Page Not Found/;

test('unknown route returns 404 @smoke', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(NOT_FOUND_STATUS);
  await expect(page).toHaveTitle(NOT_FOUND_TITLE);
  await expect(page.getByRole('heading', { name: 'That page is not here.' })).toBeVisible();
});
