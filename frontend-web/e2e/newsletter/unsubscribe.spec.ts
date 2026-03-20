import { expect, test } from '@playwright/test';

test.describe('Newsletter unsubscribe (token) page', () => {
  test('shows error when no token is provided', async ({ page }) => {
    await page.goto('/newsletter/unsubscribe');
    await expect(page.locator('#status')).toContainText('No token provided.');
  });

  test('shows success message when token is valid', async ({ page }) => {
    await page.route('**/newsletter/unsubscribe', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.goto('/newsletter/unsubscribe?token=valid-token');
    await expect(page.locator('#status')).toContainText('Successfully unsubscribed.');
  });

  test('shows error message when token is rejected by API', async ({ page }) => {
    await page.route('**/newsletter/unsubscribe', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Token expired or invalid.' }),
      }),
    );
    await page.goto('/newsletter/unsubscribe?token=bad-token');
    await expect(page.locator('#status')).toContainText('Token expired or invalid.');
  });
});
