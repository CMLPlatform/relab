/**
 * Accessibility E2E: runs axe against the Expo web build.
 *
 * Scoped to the guest-accessible core screens so it needs no login/seeding
 * beyond the running full-stack (see e2e-full-stack in validate.yml).
 *
 * We gate on serious + critical violations only. RN-Web rendering emits
 * minor/moderate axe noise (and theme-token color-contrast) that the app
 * can't meaningfully fix, so gating on those would make CI red on library
 * internals rather than real regressions. color-contrast is disabled for the
 * same reason (mirrors docs/e2e/accessibility.spec.ts).
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { openSeededProductFromProductsPage, reachProductsPage } from './helpers';

// Aligned across www/docs/app: WCAG 2.0 + 2.1, level A + AA — the real-world
// baseline. (WCAG 2.2-only criteria are omitted; axe-core's rule coverage for
// them is too sparse to gate on.)
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const GATED_IMPACTS = new Set(['serious', 'critical']);

async function seriousViolations(page: Page) {
  // Neutralize animations so results are deterministic (mirrors www/docs).
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

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(['color-contrast'])
    .analyze();
  return results.violations.filter((v) => v.impact && GATED_IMPACTS.has(v.impact));
}

test.describe('Accessibility', () => {
  test('products list has no serious a11y violations', async ({ page }) => {
    await reachProductsPage(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('product detail has no serious a11y violations', async ({ page }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
    expect(await seriousViolations(page)).toEqual([]);
  });
});
