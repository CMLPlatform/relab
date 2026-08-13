import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Aligned across www/docs/app: WCAG 2.0 + 2.1, level A + AA — the real-world
// baseline. (WCAG 2.2-only criteria are omitted; axe-core's rule coverage for
// them is too sparse to gate on.)
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function analyzePage(page: Page, options: { exclude?: string[] } = {}) {
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

  // Full page (header/nav/footer included), not just <main> — the repo-authored
  // chrome is fair game for a11y bugs too.
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  return builder.analyze();
}

async function switchToDarkTheme(page: Page) {
  const themeSelect = page.locator('starlight-theme-select select').first();
  await themeSelect.selectOption('dark');
  await expect.poll(async () => page.locator('html').getAttribute('data-theme')).toBe('dark');
}

test.describe('Accessibility', () => {
  test('homepage has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  test('homepage has no accessibility violations in dark theme', async ({ page }) => {
    await page.goto('/');
    await switchToDarkTheme(page);
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  test('getting started guide has no accessibility violations', async ({ page }) => {
    await page.goto('/user-guides/getting-started/');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  test('data model page (mermaid diagrams) has no accessibility violations', async ({ page }) => {
    await page.goto('/architecture/datamodel/');
    const results = await analyzePage(page);
    expect(results.violations).toEqual([]);
  });

  for (const path of ['/api/public/', '/api/device/', '/api/rpi-cam/']) {
    test(`${path} chrome has no accessibility violations`, async ({ page }) => {
      await page.goto(path);
      // #api-reference is filled client-side by the third-party Scalar bundle;
      // its markup isn't ours to fix, so scan only the repo-authored switcher
      // nav and noscript fallback around it.
      const results = await analyzePage(page, { exclude: ['#api-reference'] });
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('Viewport overflow', () => {
  const VIEWPORT_WIDTH = 375;
  const TOLERANCE_PX = 1;

  test.use({ viewport: { width: VIEWPORT_WIDTH, height: 800 } });

  // system-design carries the widest terminal block on the site (a directory
  // tree), which is what made long code lines escape their own `pre` and push
  // the whole page sideways. Keep it in this list as the regression guard.
  for (const path of ['/architecture/datamodel/', '/architecture/system-design/', '/api/public/']) {
    test(`${path} has no horizontal overflow at ${VIEWPORT_WIDTH}px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(VIEWPORT_WIDTH + TOLERANCE_PX);
    });
  }
});
