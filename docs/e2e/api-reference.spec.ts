import { expect, test } from '@playwright/test';

test.describe('API reference pages', () => {
  let liveSchemaRequests: string[];
  let scalarServiceRequests: string[];

  test.beforeEach(async ({ page }) => {
    liveSchemaRequests = [];
    scalarServiceRequests = [];
    await page.route('http://127.0.0.1:18010/openapi.*.json', async (route) => {
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

    await expect(page).toHaveTitle('ReLab public API · ReLab docs');
    const apiNav = page.getByRole('navigation', { name: 'API references' });
    await expect(apiNav.getByRole('link', { name: 'API reference overview' })).toHaveAttribute(
      'href',
      '/api-reference/',
    );
    await expect(apiNav.getByRole('link', { exact: true, name: 'Public API' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(apiNav.getByRole('link', { exact: true, name: 'Device API' })).toHaveAttribute(
      'href',
      '/api/device/',
    );
    await expect(apiNav.getByRole('separator', { name: 'Plugin API references' })).toBeVisible();
    await expect(apiNav.getByRole('link', { exact: true, name: 'RPi camera API' })).toHaveAttribute(
      'href',
      '/api/rpi-cam/',
    );
    await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'ReLab - Data Collection API' })).toBeVisible();
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

    await expect(page).toHaveTitle('ReLab device API · ReLab docs');
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

    await expect(page).toHaveTitle('ReLab RPi camera API · ReLab docs');
    await expect(page.getByRole('heading', { name: 'Get camera status' })).toBeVisible();
    await expect(page.getByText('/camera').first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(liveSchemaRequests).toEqual([]);
    expect(scalarServiceRequests).toEqual([]);
  });
});

test.describe('API reference discoverability', () => {
  test('homepage and sidebar expose API reference entry points', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('main').getByRole('link', { exact: true, name: 'API reference' })).toHaveAttribute(
      'href',
      'api-reference/',
    );
    await expect(
      page.getByRole('main').getByRole('link', { exact: true, name: 'Public API reference' }),
    ).toHaveAttribute(
      'href',
      '/api/public/',
    );

    const sidebar = page.getByRole('navigation', { name: 'Main' });
    await expect(sidebar.getByRole('link', { exact: true, name: 'API reference' })).toHaveAttribute(
      'href',
      '/api-reference/',
    );
    await expect(sidebar.getByRole('link', { exact: true, name: 'Public API' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { exact: true, name: 'Device API' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { exact: true, name: 'RPi camera API' })).toHaveCount(0);
  });

  test('related docs pages link to the API reference overview', async ({ page }) => {
    const pages = ['/user-guides/api/', '/user-guides/rpi-cam/', '/architecture/api/', '/architecture/rpi-cam/'];

    for (const path of pages) {
      await page.goto(path);
      await expect(
        page.getByRole('main').getByRole('link', { exact: true, name: 'API reference overview' }).first(),
      ).toHaveAttribute('href', '/api-reference/');
    }
  });
});
