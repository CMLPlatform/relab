import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import BrandHero from './BrandHero.astro';

const STATS = {
  totals: { teardowns: 47, parts: 1600, mass_kg: 340, images: 3610, users: 12 },
  series: [],
  generatedAt: '2026-07-17T00:00:00Z',
};
const APP_URL = 'https://app.cml-relab.org';

async function render(props: Record<string, unknown> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(BrandHero, {
    props: { stats: STATS, appUrl: APP_URL, ...props },
  });
}

describe('BrandHero', () => {
  it('leads with the thesis and the nutshell', async () => {
    const html = await render();
    expect(html).toContain('Open product data for circular-economy research');
    expect(html).toMatch(/Relab documents how durable goods come apart/);
  });

  it('carries the mark decoratively, in both theme variants', async () => {
    const html = await render();
    // Linked, not inlined: nothing animates the artwork's internals, so the two
    // variants ship as hashed, cacheable URLs with their box reserved.
    expect(html).not.toContain('<svg');
    expect(html.match(/<img[^>]*class="brand-(light|dark)"/g)).toHaveLength(2);
    expect(html.match(/width="156" height="84"/g)).toHaveLength(2);
    // The header's brand link carries the name; this one is decoration, and
    // hands off to it on scroll.
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('alt="Relab"');
  });

  it('offers both doors: browsing the records and contributing one', async () => {
    const html = await render();
    expect(html).toContain('https://app.cml-relab.org/products');
    expect(html).toContain('https://app.cml-relab.org/new-account');
    expect(html).toMatch(/Browse the records/);
    expect(html).toMatch(/Contribute a teardown/);
    // Both leave the site, and each says so to a screen reader.
    expect(html.match(/\(opens in new tab\)/g)).toHaveLength(2);
  });

  it('states each door’s precondition on the button itself', async () => {
    const html = await render();
    // The sign-up requirement is only relevant at the moment of choosing, so it
    // rides on the control rather than as a sentence the reader has to carry
    // back to it. Inside the <a>, so it is part of the accessible name.
    expect(html).toMatch(/Contribute a teardown<\/span><span[^>]*>Free account/);
    expect(html).toMatch(/Browse the records<\/span><span[^>]*>No account needed/);
  });

  it('shows one headline figure, not a triad, and omits it without stats', async () => {
    const html = await render();
    expect(html).toContain('data-metrics');
    expect(html).toContain('1,600 parts documented');
    // The old interpunct-separated totals line read as decoration.
    expect(html).not.toContain('teardowns ·');

    const withoutStats = await render({ stats: null });
    expect(withoutStats).not.toContain('data-metrics');
  });

  it('names the institution behind the platform above the fold', async () => {
    const html = await render();
    expect(html).toContain('Leiden University');
    expect(html).toContain('Institute of Environmental Sciences (CML)');
  });
});
