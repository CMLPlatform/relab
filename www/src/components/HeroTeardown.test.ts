import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import HeroTeardown from './HeroTeardown.astro';

const TEARDOWN = {
  id: 47,
  name: 'Dell XPS 13',
  brand: 'Dell',
  weightG: 1190,
  parts: [
    { name: 'Battery pack', weightG: 212 },
    { name: 'Shell', weightG: null },
  ],
  photos: [{ url: '/media/a.jpg', alt: 'Dell XPS 13, photographed during disassembly' }],
};
const STATS = {
  totals: { teardowns: 47, parts: 1600, mass_kg: 340, images: 3610, users: 12 },
  series: [],
  generatedAt: '2026-07-17T00:00:00Z',
};
const APP_URL = 'https://app.cml-relab.org';

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(HeroTeardown, {
    props: { teardown: TEARDOWN, stats: STATS, appUrl: APP_URL, ...props },
  });
}

describe('HeroTeardown', () => {
  it('renders the product name and its parts with masses', async () => {
    const html = await render({});
    expect(html).toContain('Dell XPS 13');
    expect(html).toContain('Battery pack');
    expect(html).toContain('212 g');
  });

  it('renders an em dash for a part with no recorded mass', async () => {
    const html = await render({});
    expect(html).not.toMatch(/null|NaN/);
    expect(html).toContain('—');
  });

  it('omits the photo strip when there are no photos', async () => {
    const html = await render({ teardown: { ...TEARDOWN, photos: [] } });
    expect(html).not.toContain('data-photo-strip');
  });

  it('omits the metrics line when stats are unavailable', async () => {
    const html = await render({ stats: null });
    expect(html).not.toContain('data-metrics');
  });

  it('links the single CTA to the dataset', async () => {
    const html = await render({});
    expect(html).toContain('https://app.cml-relab.org/products');
    expect(html).toMatch(/Explore the dataset/);
    expect(html).not.toMatch(/Add your teardown/);
  });

  it('marks fixture data as example data, without a record number', async () => {
    const html = await render({ fromFixture: true });
    expect(html).toContain('data-fixture-note');
    expect(html).toContain('Example teardown');
    expect(html).toContain('teardown · example');
    expect(html).not.toContain('№');
  });

  it('shows no example-data marker for live data', async () => {
    const html = await render({ fromFixture: false });
    expect(html).not.toContain('data-fixture-note');
    expect(html).not.toContain('Example teardown');
    expect(html).toContain('teardown №47 · live');
  });
});
