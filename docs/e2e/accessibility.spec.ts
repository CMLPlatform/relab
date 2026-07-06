import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Aligned across www/docs/app: WCAG 2.0 + 2.1, level A + AA — the real-world
// baseline. (WCAG 2.2-only criteria are omitted; axe-core's rule coverage for
// them is too sparse to gate on.)
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function analyzePage(page: Page) {
  // Neutralize animations so results are deterministic (mirrors www).
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    `,
  });

  // Scoped to <main> so Starlight's theme-toggle/nav chrome doesn't dominate.
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).include('main').analyze();
}

test.describe('Accessibility', () => {
  test('homepage has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  test('getting started guide has no accessibility violations', async ({ page }) => {
    await page.goto('/user-guides/getting-started/');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });
});
