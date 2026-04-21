import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const A11Y_SCAN_DELAY_MS = 600;
const WCAG_TAGS = ['wcag2a', 'wcag2aa'];

test.describe('Accessibility', () => {
  test('landing page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(A11Y_SCAN_DELAY_MS);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('privacy page has no critical a11y violations', async ({ page }) => {
    await page.goto('/privacy');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('newsletter unsubscribe form has no critical a11y violations', async ({ page }) => {
    await page.goto('/newsletter/unsubscribe-form');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
