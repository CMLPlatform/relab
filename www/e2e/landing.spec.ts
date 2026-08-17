import { expect, test } from '@playwright/test';

import {
  analyzeAccessibility,
  BROWSE_RECORDS_LINK_NAME,
  CONTRIBUTE_LINK_NAME,
  expectHomepageHero,
} from './helpers.ts';

// "212 g": grouped digits, a space, the unit. The em dash used for unrecorded
// masses never matches, so this finds parts with a real recorded mass.
const RECORDED_MASS_PATTERN = /^[\d,]+ g$/;

// The build bakes either the committed fixture (API unreachable at build time,
// e.g. this repo's CI-less local runs) or the live featured product. The page
// must be honest about which one it is showing.
const FIXTURE_PROVENANCE = 'Example teardown · illustrative masses, not a live record';
const LIVE_PROVENANCE_PATTERN = /^Teardown №\d+ · live record$/;

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
    // Skip (not silently pass) outside the fixture build, so a broken
    // assertion can't hide behind a vacuous pass.
    // biome-ignore lint/suspicious/noSkippedTests: conditional on the build, not a disabled test
    test.skip(
      (await page.locator('[data-fixture-note]').count()) === 0,
      'requires the committed fixture build (two expandable parts)',
    );
    const group = page.locator('.blueprint-part-group').first();
    await expect(group.locator('.blueprint-subparts')).not.toBeVisible();
    await group.locator('summary').click();
    await expect(group.locator('.blueprint-subparts')).toBeVisible();
    await expect(group.locator('.blueprint-subpart').first()).toContainText('LCD panel');
  });

  test('the teardown is labelled honestly as example or live data', async ({ page }) => {
    await page.goto('/');

    const provenance = page.locator('[data-provenance]');
    await expect(provenance).toBeVisible();
    const provenanceText = ((await provenance.textContent()) ?? '').trim();
    if (provenanceText === FIXTURE_PROVENANCE) {
      // Fixture build: the same line carries the illustrative-masses disclaimer.
      await expect(page.locator('[data-fixture-note]')).toBeVisible();
    } else {
      // Live build (API reachable at build time): a real record, no disclaimer.
      expect(provenanceText).toMatch(LIVE_PROVENANCE_PATTERN);
      await expect(page.locator('[data-fixture-note]')).toHaveCount(0);
    }
  });

  test('both calls to action point into the app @smoke', async ({ page }) => {
    await page.goto('/');

    const browse = page.getByRole('link', { name: BROWSE_RECORDS_LINK_NAME });
    expect(await browse.getAttribute('href')).toMatch(/^https?:\/\/.+\/products$/);
    await expect(browse).toHaveAttribute('rel', 'noopener noreferrer');

    // Contributing is the door that needs an account, and it says so.
    const contribute = page.getByRole('link', { name: CONTRIBUTE_LINK_NAME });
    expect(await contribute.getAttribute('href')).toMatch(/^https?:\/\/.+\/new-account$/);
    await expect(contribute).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('the colophon states who runs the platform, how to cite it, and its licence', async ({
    page,
  }) => {
    await page.goto('/');

    const colophon = page.locator('.colophon');
    await expect(colophon).toContainText('Leiden University');
    await expect(colophon).toContainText('10.5281/zenodo.16637742');
    await expect(colophon).toContainText('AGPL-3.0-or-later');
    // The dataset licence is planned, not published; the page must not claim
    // otherwise, and links the docs rather than restating the terms.
    await expect(colophon).toContainText('planned under CC BY 4.0');
    await expect(colophon).toContainText('no release has been published yet');
  });

  test('the method section shows the workflow as three grouped passes', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'From teardown to data' })).toBeVisible();
    const flow = page.locator('.flow');
    await expect(flow.locator('.flow-phase')).toHaveCount(3);
    await expect(flow.locator('.flow-step')).toHaveCount(8);

    // Descriptions are plain text now, not a hover-only tooltip on an SVG node.
    await expect(flow.getByText('Record mass and dimensions for every component.')).toBeVisible();
    // The loop is marked, since a column layout cannot draw the arrow back.
    await expect(flow.getByText('repeats per part')).toBeVisible();
  });

  test('the 9R framework is named and linked, not taught, on the landing page', async ({
    page,
  }) => {
    await page.goto('/');

    // The ladder itself lives in the docs beside its definition tables.
    await expect(page.locator('.nine-r')).toHaveCount(0);
    const link = page.getByRole('link', { name: /see the ladder in the docs/i });
    expect(await link.getAttribute('href')).toMatch(/\/project\/9r-framework\/$/);
  });

  test('the stats panel shell ships with the page', async ({ page }) => {
    await page.goto('/');

    // The shell starts hidden and is only revealed by src/scripts/stats.ts when
    // the stats API responds, so assert presence rather than visibility.
    const panel = page.locator('#stats-panel');
    await expect(panel).toBeAttached();
    await expect(panel.locator('#stats-heading')).toHaveText('What has been recorded so far');
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
