import { expect, test } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders with correct title and hero content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Reverse Engineering Lab');
    await expect(
      page.getByRole('heading', { name: 'Reverse Engineering Lab', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Demo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read Docs' })).toBeVisible();
  });

  test('renders newsletter subscription section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stay Updated' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subscribe' })).toBeVisible();
  });

  test('shows error for invalid email on subscribe', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByRole('alert')).toContainText('Please enter a valid email address.');
  });

  test('shows success message after successful subscription', async ({ page }) => {
    await page.route('**/newsletter/subscribe', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.goto('/');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByRole('alert')).toContainText('Thanks for subscribing!');
  });

  test('shows error message when subscription API fails', async ({ page }) => {
    await page.route('**/newsletter/subscribe', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Email already subscribed.' }),
      }),
    );
    await page.goto('/');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByRole('alert')).toContainText('Email already subscribed.');
  });

  test('submit via Enter key works', async ({ page }) => {
    await page.route('**/newsletter/subscribe', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.goto('/');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Email address').press('Enter');
    await expect(page.getByRole('alert')).toContainText('Thanks for subscribing!');
  });
});
