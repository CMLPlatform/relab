import { expect, test } from '@playwright/test';

test.describe('API reference pages', () => {
  let liveSchemaRequests: string[];
  let scalarServiceRequests: string[];

  test.beforeEach(async ({ page }) => {
    liveSchemaRequests = [];
    scalarServiceRequests = [];
    await page.route('http://127.0.0.1:8001/openapi.*.json', async (route) => {
      liveSchemaRequests.push(route.request().url());
      await route.abort();
    });
    await page.route(/https:\/\/(?:api|proxy|dashboard|registry)\.scalar\.com\/.*/, async (route) => {
      scalarServiceRequests.push(route.request().url());
      await route.abort();
    });
  });

  test('public API reference renders from the committed docs schema', async ({ page }) => {
    await page.goto('/api/public/');

    await expect(page.getByText('RELab public API')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download OpenAPI Document' })).toHaveAttribute(
      'href',
      '/api/schemas/openapi.public.json',
    );
    await expect(page.getByText('/v1/auth/bearer/login').first()).toBeVisible();
    await expect(page.getByText(/Bearer/i).first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(liveSchemaRequests).toEqual([]);
    expect(scalarServiceRequests).toEqual([]);
  });

  test('device API reference renders from the committed docs schema', async ({ page }) => {
    await page.goto('/api/device/');

    await expect(page.getByText('RELab device API')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download OpenAPI Document' })).toHaveAttribute(
      'href',
      '/api/schemas/openapi.device.json',
    );
    await expect(page.getByText('/v1/plugins/rpi-cam/pairing/register').first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(liveSchemaRequests).toEqual([]);
    expect(scalarServiceRequests).toEqual([]);
  });

  test('RPi camera API reference renders from the committed docs schema', async ({ page }) => {
    await page.goto('/api/rpi-cam/');

    await expect(page.getByText('RELab RPi camera API')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Get camera status' })).toBeVisible();
    await expect(page.getByText('/camera').first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(liveSchemaRequests).toEqual([]);
    expect(scalarServiceRequests).toEqual([]);
  });
});
