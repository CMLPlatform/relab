import { expect, test } from '@playwright/test';

// Structural (ARIA) snapshots instead of pixel diffs: catch reordered
// landmarks, lost headings, and accidental nesting without the maintenance
// burden of per-browser pixel baselines.

test.describe('Structure regression', () => {
  test('homepage landmarks', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toMatchAriaSnapshot({
      name: 'homepage.aria.yml',
    });
  });

  test('architecture system-design landmarks', async ({ page }) => {
    await page.goto('/architecture/system-design/');
    await expect(page.locator('main')).toMatchAriaSnapshot({
      name: 'system-design.aria.yml',
    });
  });

  test('404 page landmarks', async ({ page }) => {
    await page.goto('/404/');
    await expect(page.locator('main')).toMatchAriaSnapshot({
      name: '404.aria.yml',
    });
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
