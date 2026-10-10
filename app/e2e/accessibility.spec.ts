/**
 * Accessibility E2E: runs axe against the Expo web build.
 *
 * Scoped to the guest-accessible core screens so it needs no login/seeding
 * beyond the running full-stack (see e2e-full-stack in ci.yml).
 *
 * We gate on serious + critical violations only. RN-Web rendering emits
 * minor/moderate axe noise (and theme-token color-contrast) that the app
 * can't meaningfully fix, so gating on those would make CI red on library
 * internals rather than real regressions. color-contrast is disabled for the
 * same reason (mirrors docs/e2e/accessibility.spec.ts).
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  loginAndReachProducts,
  openNewProductPage,
  openSeededProductFromProductsPage,
  reachProductsPage,
  SEEDED_MEMBER,
} from './helpers';

// Aligned across www/docs/app: WCAG 2.0-2.2, level A + AA, the stated target.
// target-size (2.5.8) is the only 2.2-only rule axe-core ships; 2.4.11 and
// 2.4.13 have no axe coverage and are verified by hand.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const GATED_IMPACTS = new Set(['serious', 'critical']);
// ARIA misuse the app controls: fail at any impact so a regression in the
// role/attribute plumbing cannot hide behind a moderate rating.
const ALWAYS_GATED_RULES = new Set([
  'aria-prohibited-attr',
  'aria-allowed-role',
  'aria-valid-attr-value',
]);

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
  return results.violations.filter(
    (v) => ALWAYS_GATED_RULES.has(v.id) || (v.impact && GATED_IMPACTS.has(v.impact)),
  );
}

/** Focus `target` and read what its focus indicator actually computes to. */
async function focusIndicator(target: Locator) {
  await target.focus();
  return target.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      matchesFocusVisible: el.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}

test.describe('Accessibility', () => {
  test('products list has no serious a11y violations', async ({ page }) => {
    await reachProductsPage(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  // Landmarks, page title and entry focus: the three things a screen-reader
  // user meets first on every route change.
  test('products list exposes landmarks, a titled document and focus in main', async ({ page }) => {
    await reachProductsPage(page);
    await expect(page).toHaveTitle('Products · R9lab');
    await expect(page.getByRole('main')).toBeVisible();
    // Below lg the bottom tab bar, at lg the TopNav: either way one primary nav.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    // Entry focus lands inside main (its h1 when there is one), never on <body>.
    const focusedInMain = await page.evaluate(
      () =>
        document.activeElement?.closest('main') !== null &&
        document.activeElement !== document.body,
    );
    expect(focusedInMain).toBe(true);
  });

  // Phone width: below lg these screens have no in-page title row, and the
  // public profile's heading only arrives with its data. Focus must still
  // land on the screen's h1, not on the unlabelled main column.
  test('entry focus lands on the screen heading @auth', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAndReachProducts(page, SEEDED_MEMBER);
    for (const [path, title] of [
      ['/category-selection', 'Select category'],
      ['/cameras/add', 'Add camera'],
      ['/users/bob', 'bob'],
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page, so each route loads after the last.
      await page.goto(path);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(title, {
        timeout: 15_000,
      });
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.tagName), { message: path })
        .toBe('H1');
    }
  });

  // MIN_TAP_TARGET (44) over WCAG 2.2 SC 2.5.8's 24px: the switch track is
  // 18x32, so on web (no hitSlop) its hit area extends past the track.
  test('switch hit area is at least 44px square', async ({ page }) => {
    await reachProductsPage(page);
    await page.locator('body').press('?');
    const toggle = page.getByRole('switch', { name: 'Single-key shortcuts' });
    await expect(toggle).toBeVisible();
    const hits = await toggle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;
      return [
        [midX, midY - 21.5],
        [midX, midY + 21.5],
        [midX - 21.5, midY],
        [midX + 21.5, midY],
      ].map(([x, y]) => el.contains(document.elementFromPoint(x, y)));
    });
    expect(hits).toEqual([true, true, true, true]);
  });

  test('login page is titled', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle('Sign in · R9lab');
  });

  test('product detail has no serious a11y violations', async ({ page }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  // Authenticated: the preferences radios (theme, profile visibility) render as
  // plain Views, so their state and grouping only exist if the component spells
  // out aria-checked / role=radiogroup: react-native-web drops accessibilityState.
  test('account screen has no serious a11y violations @auth', async ({ page }) => {
    await loginAndReachProducts(page, SEEDED_MEMBER);
    await page.goto('/account');
    await expect(page.getByRole('radio', { name: 'Auto theme' })).toBeVisible({
      timeout: 15_000,
    });
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

    const focus = await focusIndicator(signIn);
    expect(focus.matchesFocusVisible).toBe(true);
    // The load-bearing assertion: a width and a colour are not an indicator.
    expect(focus.outlineStyle).not.toBe('none');
    expect(focus.outlineWidth).not.toBe('0px');

    // Text fields too: a plain TextInput takes the same ring from global.css.
    const email = await focusIndicator(page.getByLabel('Email or username'));
    expect(email.outlineStyle).not.toBe('none');
    expect(email.outlineWidth).not.toBe('0px');
  });

  // A spec (measurement) field once carried an inline `outline: none`, which
  // outranks the stylesheet ring: focus on it painted nothing.
  test('a measurement field paints a visible focus indicator @auth', async ({ page }) => {
    await loginAndReachProducts(page);
    await openNewProductPage(page);
    await page.getByRole('textbox', { name: 'Name' }).fill(`E2E focus ${Date.now()}`);
    await page.getByRole('button', { name: 'Create product' }).click();
    await page.getByRole('button', { name: 'Add properties' }).click({ timeout: 15_000 });

    const focus = await focusIndicator(page.getByPlaceholder('e.g. 12').first());
    expect(focus.matchesFocusVisible).toBe(true);
    expect(focus.outlineStyle).not.toBe('none');
    expect(focus.outlineWidth).not.toBe('0px');
  });
});
