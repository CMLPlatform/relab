import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa'];

async function analyzePage(page: Page) {
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

  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

test.describe('Accessibility', () => {
  test('landing page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  test('privacy page has no critical a11y violations', async ({ page }) => {
    await page.goto('/privacy');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  test('newsletter unsubscribe form has no critical a11y violations', async ({ page }) => {
    await page.goto('/newsletter/unsubscribe-form');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });
});
