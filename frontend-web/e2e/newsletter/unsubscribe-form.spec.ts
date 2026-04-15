import { expect, test } from '@playwright/test';

test.describe('Newsletter unsubscribe form', () => {
  const message = '#newsletter-message';

  test('renders the unsubscribe form', async ({ page }) => {
    await page.goto('/newsletter/unsubscribe-form');
    await expect(
      page.getByRole('heading', { name: 'Unsubscribe from Newsletter', level: 1 }),
    ).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    await page.goto('/newsletter/unsubscribe-form');
    await page.getByLabel('Email address').fill('not_an_email');
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.locator(message)).toContainText('Please enter a valid email address.');
  });

  test('shows success message after valid submission', async ({ page }) => {
    await page.route('**/newsletter/request-unsubscribe', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Please check your email to confirm unsubscription.' }),
      }),
    );
    await page.goto('/newsletter/unsubscribe-form');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.locator(message)).toContainText(
      'Please check your email to confirm unsubscription.',
    );
  });

  test('shows loading state and disables controls while submitting', async ({ page }) => {
    await page.route('**/newsletter/request-unsubscribe', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Please check your email to confirm unsubscription.' }),
      });
    });
    await page.goto('/newsletter/unsubscribe-form');
    await page.getByLabel('Email address').fill('test@example.com');
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    await expect(page.getByLabel('Email address')).toBeDisabled();
    await expect(submitButton).toBeDisabled();
    await expect(page.locator(message)).toContainText('Submitting…');
    await expect(page.locator(message)).toContainText(
      'Please check your email to confirm unsubscription.',
    );
  });

  test('shows error message when API fails', async ({ page }) => {
    await page.route('**/newsletter/request-unsubscribe', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Email not found.' }),
      }),
    );
    await page.goto('/newsletter/unsubscribe-form');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.locator(message)).toContainText('Email not found.');
  });

  test('submit via Enter key works', async ({ page }) => {
    await page.route('**/newsletter/request-unsubscribe', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Please check your email to confirm unsubscription.' }),
      }),
    );
    await page.goto('/newsletter/unsubscribe-form');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Email address').press('Enter');
    await expect(page.locator(message)).toContainText('Please check your email');
  });
});
