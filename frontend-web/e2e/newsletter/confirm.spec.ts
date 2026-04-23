import { expect, test } from '@playwright/test';

test.describe('Newsletter confirmation page', () => {
  test('shows error when no token is provided', async ({ page }) => {
    await page.goto('/newsletter/confirm');
    await expect(page.locator('#status')).toContainText('No confirmation token provided.');
  });

  test('shows success message when token is valid', async ({ page }) => {
    await page.route('**/newsletter/confirm', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.goto('/newsletter/confirm?token=valid-token');
    await expect(page.locator('#status')).toContainText('Newsletter subscription confirmed!');
  });

  test('shows error message when token is rejected by API', async ({ page }) => {
    await page.route('**/newsletter/confirm', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Token expired or invalid.' }),
      }),
    );
    await page.goto('/newsletter/confirm?token=bad-token');
    await expect(page.locator('#status')).toContainText('Token expired or invalid.');
  });
});
