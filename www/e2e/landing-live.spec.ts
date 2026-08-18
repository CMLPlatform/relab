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
      const srcset = (await plate.getAttribute('srcset')) ?? '';
      const widths = [...srcset.matchAll(/\s(\d+w)(?:,|$)/g)].map(([, width]) => width);
      expect(widths).toEqual(EXPECTED_CANDIDATE_WIDTHS);

      // Widths alone cannot tell a browser how big the image will be laid out,
      // so a srcset without sizes is a srcset that picks the wrong candidate.
      expect(await plate.getAttribute('sizes')).toBeTruthy();

      // Fetched rather than decoded in the page. Both origins here are ports on
      // 127.0.0.1, which has no registrable domain, and Chromium blocks such a
      // cross-port load under the API's Cross-Origin-Resource-Policy: same-site
      // (see the backend's response_policy.py). Deployed origins are both
      // *.cml-relab.org and load normally, so the block is an artefact of the
      // rig; the request is what this lane can honestly assert.
      const url = widestCandidate(srcset);
      const response = await page.request.get(url);
      expect(response.status(), url).toBe(200);
      expect(response.headers()['content-type']).toMatch(/^image\//);
    }
  });

  test('the assembled product print is served from the API too', async ({ page }) => {
    await page.goto('/');

    const assembly = page.locator('[data-assembly] img');
    await expect(assembly).toHaveCount(1);
    expect(await assembly.getAttribute('src')).toMatch(/^https?:\/\/.+\/uploads\/images\/.+/);
  });
});
