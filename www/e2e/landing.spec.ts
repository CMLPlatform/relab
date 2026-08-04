import { expect, test } from '@playwright/test';

import { analyzeAccessibility, EXPLORE_DATASET_LINK_NAME, expectHomepageHero } from './helpers.ts';

// "212 g" — grouped digits, a space, the unit. The em dash used for unrecorded
// masses never matches, so this finds parts with a real recorded mass.
const RECORDED_MASS_PATTERN = /^[\d,]+ g$/;

// The build bakes either the committed fixture (API unreachable at build time,
// e.g. this repo's CI-less local runs) or the live featured product. The page
// must be honest about which one it is showing.
const FIXTURE_EYEBROW = 'teardown · example';
const LIVE_EYEBROW_PATTERN = /^teardown №\d+ · live$/;

test.describe('Landing page content', () => {
  test('hero blueprint shows a named teardown with weighed parts @smoke', async ({ page }) => {
    await page.goto('/');
    await expectHomepageHero(page);

    const blueprint = page.locator('.blueprint');
    await expect(blueprint.getByRole('heading', { level: 2 })).not.toBeEmpty();

    // Explicit role="list" keeps list semantics in WebKit under list-style: none.
    await expect(blueprint.locator('.blueprint-parts')).toHaveAttribute('role', 'list');
    const parts = blueprint.locator('.blueprint-part');
    expect(await parts.count()).toBeGreaterThan(0);
    await expect(
      blueprint.locator('.blueprint-part-mass').filter({ hasText: RECORDED_MASS_PATTERN }).first(),
    ).toBeVisible();
  });

  test('expandable parts reveal their subcomponents without JS', async ({ page }) => {
    await page.goto('/');

    // Live builds may feature a product with no recorded subcomponents, so
    // only the fixture build (which commits two expandable parts) asserts.
    if ((await page.locator('[data-fixture-note]').count()) === 0) {
      return;
    }
    const group = page.locator('.blueprint-part-group').first();
    await expect(group.locator('.blueprint-subparts')).not.toBeVisible();
    await group.locator('summary').click();
    await expect(group.locator('.blueprint-subparts')).toBeVisible();
    await expect(group.locator('.blueprint-subpart').first()).toContainText('LCD panel');
  });

  test('the teardown is labelled honestly as example or live data', async ({ page }) => {
    await page.goto('/');

    const eyebrow = page.locator('.blueprint-eyebrow');
    await expect(eyebrow).toBeVisible();
    const eyebrowText = ((await eyebrow.textContent()) ?? '').trim();
    if (eyebrowText === FIXTURE_EYEBROW) {
      // Fixture build: the illustrative-masses disclaimer must be shown.
      await expect(page.locator('[data-fixture-note]')).toBeVisible();
    } else {
      // Live build (API reachable at build time): a real record, no disclaimer.
      expect(eyebrowText).toMatch(LIVE_EYEBROW_PATTERN);
      await expect(page.locator('[data-fixture-note]')).toHaveCount(0);
    }
  });

  test('the call to action points at the app dataset @smoke', async ({ page }) => {
    await page.goto('/');

    const exploreDataset = page.getByRole('link', { name: EXPLORE_DATASET_LINK_NAME });

    const href = await exploreDataset.getAttribute('href');
    expect(href).toMatch(/^https?:\/\/.+\/products$/);
    await expect(exploreDataset).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('the 9R ladder runs from Refuse down to Recover', async ({ page }) => {
    await page.goto('/');

    const ladder = page.locator('.nine-r');
    await expect(ladder.getByRole('heading', { name: 'The 9R framework' })).toBeVisible();
    const rungs = ladder.locator('.rung');
    await expect(rungs).toHaveCount(10);
    await expect(rungs.first()).toContainText('Refuse');
    await expect(rungs.last()).toContainText('Recover');
  });

  test('the method section walks from teardown to data', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'From teardown to data' })).toBeVisible();
    const flow = page.locator('#method-flow');
    await expect(flow).toBeVisible();
    await expect(flow.locator('g.node')).toHaveCount(8);

    // The script lifts each node's <title> into a popover shown on interaction.
    const popover = page.locator('#method-flow-popover');
    await expect(popover).toBeHidden();
    await flow.locator('g.node').first().click();
    await expect(popover).toBeVisible();
    await expect(popover).not.toBeEmpty();
  });

  test('Escape dismisses the method-flow popover', async ({ page }) => {
    await page.goto('/');

    const flow = page.locator('#method-flow');
    const popover = page.locator('#method-flow-popover');
    await flow.locator('g.node').first().click();
    await expect(popover).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });

  test('the stats panel shell ships with the page', async ({ page }) => {
    await page.goto('/');

    // The shell starts hidden and is only revealed by src/scripts/stats.ts when
    // the stats API responds, so assert presence rather than visibility.
    const panel = page.locator('#stats-panel');
    await expect(panel).toBeAttached();
    await expect(panel.locator('#stats-heading')).toHaveText('Torn down so far');
  });
});

test.describe('Method flow touch interaction', () => {
  test.use({ hasTouch: true });

  test('tapping a flow node toggles the popover: first tap opens, second tap closes', async ({
    page,
  }) => {
    // The page scrolls smoothly (base.css); a real tap doesn't drive a
    // scroll animation, but Playwright's scroll-into-view before each tap
    // does, and the animation's own 'scroll' events would otherwise trip
    // method-flow.ts's scroll-dismiss handler mid-gesture. Reduced motion
    // (which the site already treats as an instant-scroll signal) keeps the
    // two taps deterministic without touching the popover's dismiss logic.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const flow = page.locator('#method-flow');
    const node = flow.locator("g.node[tabindex='0']").first();
    const popover = page.locator('#method-flow-popover');
    await expect(popover).toBeHidden();

    await node.tap();
    await expect(popover).toBeVisible();

    await node.tap();
    await expect(popover).toBeHidden();
  });
});

test.describe('Landing page accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`has no critical a11y violations in the ${theme} theme`, async ({ page }) => {
      // The default preference is "system", so emulating the color scheme
      // switches the whole page theme (see theme.spec.ts).
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const results = await analyzeAccessibility(page);
      expect(results.violations).toEqual([]);
    });
  }
});
