import { expect, test } from '@playwright/test';

// This lane exists for what the committed fixture structurally cannot cover: a
// build that fetched a real record. The fixture ships one URL per photograph,
// so it can never produce a `srcset` — the responsive path is only exercised
// against an API that serves the width-keyed `thumbnail_urls` map.
//
// Run it via `just test-e2e-live` with the compose.e2e.yaml stack up. Outside
// that lane every test here skips: without the API the build falls back to the
// fixture, and asserting live content would only report the fixture's shape.
const LIVE_LANE = Boolean(process.env.WWW_E2E_LIVE?.trim());
const LIVE_PROVENANCE_PATTERN = /^Teardown №\d+ · live record$/;
// Widths the API pre-computes (THUMBNAIL_WIDTHS), minus any at or above the
// original's — the seeded photographs are wide enough to clear 800.
const EXPECTED_CANDIDATE_WIDTHS = ['200w', '800w'];

/** The URL of the widest candidate in a `srcset`, which is the one a 2x plate takes. */
function widestCandidate(srcset: string): string {
  const candidates = srcset.split(',').map((candidate) => candidate.trim());
  return candidates[candidates.length - 1]?.split(/\s+/)[0] ?? '';
}

test.describe('Landing page against a live API', () => {
  // biome-ignore lint/suspicious/noSkippedTests: conditional on an opt-in env var, not a disabled test
  test.skip(!LIVE_LANE, 'requires a build against the E2E backend (just www/test-e2e-live)');

  test('the hero shows a live record, not the committed fixture @smoke', async ({ page }) => {
    await page.goto('/');

    // The loader swallows a failed fetch and falls back to the fixture, so a
    // misconfigured API URL produces a page that looks fine and tests nothing.
    // That silent degradation is the failure this lane exists to catch.
    await expect(page.locator('[data-fixture-note]')).toHaveCount(0);
    await expect(page.locator('[data-provenance]')).toHaveText(LIVE_PROVENANCE_PATTERN);
  });

  test('plates carry a real srcset over the API derivatives', async ({ page }) => {
    await page.goto('/');

    const plates = page.locator('.plate-figure img');
    expect(await plates.count()).toBeGreaterThan(0);

    for (const plate of await plates.all()) {
      // Sequential by necessity: scrollIntoViewIfNeeded moves the shared viewport,
      // so running plates concurrently would race each other's scroll position.
      // biome-ignore lint/performance/noAwaitInLoops: scrollIntoViewIfNeeded is viewport-order-dependent
      const srcset = (await plate.getAttribute('srcset')) ?? '';
      const widths = [...srcset.matchAll(/\s(\d+w)(?:,|$)/g)].map(([, width]) => width);
      expect(widths).toEqual(EXPECTED_CANDIDATE_WIDTHS);

      // Widths alone cannot tell a browser how big the image will be laid out,
      // so a srcset without sizes is a srcset that picks the wrong candidate.
      expect(await plate.getAttribute('sizes')).toBeTruthy();

      // Decoded in the page, not fetched beside it: the API relaxes its
      // Cross-Origin-Resource-Policy for /uploads under `testing`, so the rig's
      // cross-port 127.0.0.1 origins load exactly as the deployed ones do.
      // Plates below the fold are lazy, so they hold no bytes until scrolled to.
      await plate.scrollIntoViewIfNeeded();
      await expect
        .poll(() => plate.evaluate((img: HTMLImageElement) => img.naturalWidth), {
          message: widestCandidate(srcset),
        })
        .toBeGreaterThan(0);
    }
  });

  test('the assembled product print is served from the API too', async ({ page }) => {
    await page.goto('/');

    const assembly = page.locator('[data-assembly] img');
    await expect(assembly).toHaveCount(1);
    expect(await assembly.getAttribute('src')).toMatch(/^https?:\/\/.+\/uploads\/images\/.+/);
  });
});
