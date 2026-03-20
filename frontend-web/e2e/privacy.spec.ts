import { expect, test } from '@playwright/test';

test('privacy page renders', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveTitle(/Privacy/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
