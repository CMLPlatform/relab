import { expect, test } from '@playwright/test';

test('health endpoint returns ok', async ({ page }) => {
  const response = await page.goto('/health');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('ok');
});
