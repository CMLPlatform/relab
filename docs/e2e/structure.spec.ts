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
