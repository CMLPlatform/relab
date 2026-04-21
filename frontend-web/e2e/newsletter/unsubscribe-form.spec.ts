import { expect, type Page, test } from '@playwright/test';

import { expectContentPage } from '../helpers.ts';

const message = '#newsletter-message';
const unsubscribeFormPath = '/newsletter/unsubscribe-form';
const unsubscribeRequestPattern = '**/newsletter/request-unsubscribe';
const okStatus = 200;
const clientErrorStatus = 400;
const successMessage = 'Please check your email to confirm unsubscription.';

async function gotoUnsubscribeForm(page: Page) {
  await page.goto(unsubscribeFormPath);
}

async function fillEmail(page: Page, value: string) {
  await page.getByLabel('Email address').fill(value);
}

async function mockUnsubscribeRequest(page: Page, status: number, body: object) {
  await page.route(unsubscribeRequestPattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

test.describe('Newsletter unsubscribe form rendering and validation', () => {
  test('renders the unsubscribe form', async ({ page }) => {
    await gotoUnsubscribeForm(page);
    await expect(
      page.getByRole('heading', { name: 'Unsubscribe from Newsletter', level: 1 }),
    ).toBeVisible();
    await expectContentPage(page);
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toBeVisible();
  });

  test('shows validation error for invalid email', async ({ page }) => {
    await gotoUnsubscribeForm(page);
    await fillEmail(page, 'not_an_email');
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.locator(message)).toContainText('Please enter a valid email address.');
  });
});

test.describe('Newsletter unsubscribe form submission states', () => {
  test('shows success message after valid submission', async ({ page }) => {
    await mockUnsubscribeRequest(page, okStatus, { message: successMessage });
    await gotoUnsubscribeForm(page);
    await fillEmail(page, 'test@example.com');
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.locator(message)).toContainText(successMessage);
  });

  test('shows loading state and disables controls while submitting', async ({ page }) => {
    let releaseResponse!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await page.route(unsubscribeRequestPattern, async (route) => {
      await responseReady;
      await route.fulfill({
        status: okStatus,
        contentType: 'application/json',
        body: JSON.stringify({ message: successMessage }),
      });
    });

    await gotoUnsubscribeForm(page);
    await fillEmail(page, 'test@example.com');

    // Stable selector: the button's text flips to "Sending…" during submission,
    // so match by type/form position rather than accessible name.
    const submitButton = page.locator('form button[type="submit"]');
    await submitButton.click();

    await expect(page.getByLabel('Email address')).toBeDisabled();
    await expect(submitButton).toBeDisabled();
    await expect(page.locator(message)).toContainText('Submitting…');

    releaseResponse();

    await expect(page.locator(message)).toContainText(successMessage);
  });

  test('shows error message when API fails', async ({ page }) => {
    await mockUnsubscribeRequest(page, clientErrorStatus, { detail: 'Email not found.' });
    await gotoUnsubscribeForm(page);
    await fillEmail(page, 'test@example.com');
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.locator(message)).toContainText('Email not found.');
  });

  test('submit via Enter key works', async ({ page }) => {
    await mockUnsubscribeRequest(page, okStatus, { message: successMessage });
    await gotoUnsubscribeForm(page);
    await fillEmail(page, 'test@example.com');
    await page.getByLabel('Email address').press('Enter');
    await expect(page.locator(message)).toContainText('Please check your email');
  });
});
