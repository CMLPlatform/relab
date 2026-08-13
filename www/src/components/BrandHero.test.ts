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
  it('leads with the logo, the thesis, and the nutshell', async () => {
    const html = await render();
    expect(html).toMatch(/<svg[^>]*viewBox/);
    expect(html).toContain('Open product data for circular-economy research');
    expect(html).toMatch(/Relab documents how durable goods come apart/);
  });

  it('inlines both logo variants so the ring stays reachable from CSS', async () => {
    const html = await render();
    // Linking the logo instead would leave nothing for the load-in ring draw
    // (BrandHero) or the scroll-driven close (SiteHeader) to animate.
    expect(html).not.toMatch(/<img[^>]*logo/);
    expect(html.match(/<circle/g)).toHaveLength(2);
  });

  it('links the single CTA to the dataset, warning that it opens a new tab', async () => {
    const html = await render();
    expect(html).toContain('https://app.cml-relab.org/products');
    expect(html).toMatch(/Explore the dataset/);
    expect(html).toContain('(opens in new tab)');
  });

  it('renders the totals, and omits the line when stats are unavailable', async () => {
    const html = await render();
    expect(html).toContain('data-metrics');
    expect(html).toContain('47 teardowns');

    const withoutStats = await render({ stats: null });
    expect(withoutStats).not.toContain('data-metrics');
  });

  it('keeps the hero logo decorative — the header brand link carries the name', async () => {
    const html = await render();
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('alt="Relab"');
  });
});
