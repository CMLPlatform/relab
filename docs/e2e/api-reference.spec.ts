import { expect, test } from '@playwright/test';

const SCHEMA = {
  openapi: '3.1.0',
  info: {
    title: 'RELab test API',
    version: '1.0.0',
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  },
  paths: {
    '/v1/auth/bearer/login': {
      post: {
        operationId: 'login',
        summary: 'Login',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'OK',
          },
        },
      },
    },
  },
};

test.describe('API reference pages', () => {
  let scalarServiceRequests: string[];

  test.beforeEach(async ({ page }) => {
    scalarServiceRequests = [];
    await page.route('http://127.0.0.1:8001/openapi.*.json', async (route) => {
      await route.fulfill({ json: SCHEMA });
    });
    await page.route(/https:\/\/(?:api|proxy|dashboard|registry)\.scalar\.com\/.*/, async (route) => {
      scalarServiceRequests.push(route.request().url());
      await route.abort();
    });
  });

  test('public API reference renders from the live backend schema', async ({ page }) => {
    await page.goto('/api/public/');

    await expect(page.getByText('RELab public API')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Test Request/ })).toBeVisible();
    await expect(page.getByText(/Bearer/i).first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(scalarServiceRequests).toEqual([]);
  });

  test('device API reference renders from the live backend schema', async ({ page }) => {
    await page.goto('/api/device/');

    await expect(page.getByText('RELab device API')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Test Request/ })).toBeVisible();
    await expect(page.getByText(/Bearer/i).first()).toBeVisible();
    await expect(page.getByText(/Add API/i)).toHaveCount(0);
    await expect(page.getByText(/Open in Scalar/i)).toHaveCount(0);
    await expect(page.getByText(/Scalar Agent/i)).toHaveCount(0);
    expect(scalarServiceRequests).toEqual([]);
  });
});
