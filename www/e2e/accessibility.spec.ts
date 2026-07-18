import { expect, test } from '@playwright/test';

import { analyzeAccessibility } from './helpers.ts';

// The landing page is scanned in both themes in landing.spec.ts.
test.describe('Accessibility', () => {
  test('privacy page has no critical a11y violations', async ({ page }) => {
    await page.goto('/privacy');
    const results = await analyzeAccessibility(page);
    expect(results.violations).toEqual([]);
  });
});
