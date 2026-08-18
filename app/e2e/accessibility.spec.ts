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

// Aligned across www/docs/app: WCAG 2.0-2.2, level A + AA — the stated target.
// target-size (2.5.8) is the only 2.2-only rule axe-core ships; 2.4.11 and
// 2.4.13 have no axe coverage and are verified by hand.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
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

  /**
   * WCAG 2.2 SC 2.4.7 Focus Visible (A) and 2.4.13 Focus Appearance (AA).
   *
   * axe has no focus-appearance rule, so nothing above catches this. Two
   * successive implementations of the focus indicator shipped completely
   * invisible while every class-string test stayed green:
   *
   *   1. `focus-visible:ring-*` compiles to a box-shadow layer, which the
   *      `shadow-none` in the same class string flattened away.
   *   2. `focus-visible:outline-2` compiles to
   *      `outline-style: var(--tw-outline-style)`, and the `outline-none` in
   *      the same class string sets that variable to `none` unconditionally.
   *
   * Both times width and colour computed correctly and nothing painted. The
   * only assertion that would have caught either is this one: that the
   * indicator has a real, non-`none` computed style while focused. Assert the
   * painted result, never the utility that is supposed to produce it.
   */
  test('keyboard focus paints a visible indicator @auth', async ({ page }) => {
    await page.goto('/login');
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn).toBeVisible({ timeout: 15_000 });

    await signIn.focus();

    const focus = await signIn.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        matchesFocusVisible: el.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });

    expect(focus.matchesFocusVisible).toBe(true);
    // The load-bearing assertion: a width and a colour are not an indicator.
    expect(focus.outlineStyle).not.toBe('none');
    expect(focus.outlineWidth).not.toBe('0px');
  });
});
