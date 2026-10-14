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
    await page.route(
      /^https:\/\/(?:api|proxy|dashboard|registry)\.scalar\.com\//,
      async (route) => {
        scalarServiceRequests.push(route.request().url());
        await route.abort();
      },
    );
  });

  test('public API reference renders from the committed docs schema', async ({ page }) => {
    await page.goto('/api/public/');

    await expect(page).toHaveTitle('R9lab public API · R9lab docs');
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
    await expect(apiNav.getByRole('separator')).toBeVisible();
    await expect(apiNav.getByRole('link', { exact: true, name: 'RPi camera API' })).toHaveAttribute(
      'href',
      '/api/r9cam/',
    );
    // Starlight chrome must not leak into the standalone reference pages; the
    // sidebar and search that do render belong to Scalar.
    await expect(page.locator('site-search')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'R9lab – Data Collection API' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download OpenAPI Document' })).toHaveAttribute(
      'href',
      '/api/schemas/openapi.public.json',
    );
    await expect(page.getByText('/v1/auth/bearer/login').first()).toBeVisible();
    await expect(page.getByText(/Bearer/i).first()).toBeVisible();
    // BRAND_CSS targets Scalar internals to reach the WCAG 2.5.8 24px minimum;
    // a Scalar upgrade that renames them fails here.
    for (const selector of [
      '[data-sidebar-id] button[aria-expanded].absolute',
      'button[id^="headlessui-popover-button"]',
    ]) {
      const targets = page.locator(selector);
      await expect(targets.first()).toBeVisible();
      for (const box of await Promise.all(
        (await targets.all()).map((target) => target.boundingBox()),
      )) {
        if (selector.startsWith('[data-sidebar-id]')) {
          expect(box?.width).toBeGreaterThanOrEqual(24);
        }
        expect(box?.height).toBeGreaterThanOrEqual(24);
      }
    }
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(liveSchemaRequests).toEqual([]);
    expect(scalarServiceRequests).toEqual([]);
  });

  test('device API reference renders from the committed docs schema', async ({ page }) => {
    await page.goto('/api/device/');

    await expect(page).toHaveTitle('R9lab device API · R9lab docs');
    await expect(page.getByRole('link', { name: 'Download OpenAPI Document' })).toHaveAttribute(
      'href',
      '/api/schemas/openapi.device.json',
    );
    await expect(page.getByText('/v1/plugins/r9cam/pairing/register').first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(liveSchemaRequests).toEqual([]);
    expect(scalarServiceRequests).toEqual([]);
  });

  test('RPi camera API reference renders from the committed docs schema', async ({ page }) => {
    await page.goto('/api/r9cam/');

    await expect(page).toHaveTitle('R9lab RPi camera API · R9lab docs');
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

    // The overview reaches the references through the "Start here" card only.
    // The direct "Open public API reference" shortcut is deliberately gone: it
    // sat in a "Quick links" block that repeated the header CTA and the sidebar,
    // and /api/public/ is one click further, from the API reference page itself.
    await expect(
      page.getByRole('main').getByRole('link', { exact: true, name: 'API reference' }),
    ).toHaveAttribute('href', 'api-reference/');
    await expect(
      page.getByRole('main').getByRole('link', { name: /public API reference/i }),
    ).toHaveCount(0);

    const sidebar = page.getByRole('navigation', { name: 'Main' });
    await expect(sidebar.getByRole('link', { exact: true, name: 'API reference' })).toHaveAttribute(
      'href',
      '/api-reference/',
    );
    await expect(sidebar.getByRole('link', { exact: true, name: 'Public API' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { exact: true, name: 'Device API' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { exact: true, name: 'RPi camera API' })).toHaveCount(0);
  });

  for (const path of [
    '/user-guides/api/',
    '/user-guides/r9cam/',
    '/architecture/api/',
    '/architecture/r9cam/',
  ]) {
    test(`${path} links to the API reference overview`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page
          .getByRole('main')
          .getByRole('link', { exact: true, name: 'API reference overview' })
          .first(),
      ).toHaveAttribute('href', '/api-reference/');
    });
  }

  for (const section of ['user-guides', 'architecture', 'api']) {
    test(`/${section}/rpi-cam/ redirects to the r9cam page`, async ({ page }) => {
      await page.goto(`/${section}/rpi-cam/`);
      await expect(page).toHaveURL(`/${section}/r9cam/`);
    });
  }
});
