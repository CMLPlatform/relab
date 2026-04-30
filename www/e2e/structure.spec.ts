import { expect, test } from '@playwright/test';

// Structural (ARIA) snapshots instead of pixel diffs: catch reordered
// landmarks, lost headings, and accidental nesting without the maintenance
// burden of per-browser pixel baselines. Scoped to the `chromium` project
// via playwright.config.ts testIgnore — one baseline is enough for structure.

test.describe('Structure regression', () => {
  test('homepage landmarks', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toMatchAriaSnapshot({
      name: 'homepage.aria.yml',
    });
  });

  test('privacy page landmarks', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('main')).toMatchAriaSnapshot({
      name: 'privacy.aria.yml',
    });
  });
});
