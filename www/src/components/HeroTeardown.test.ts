import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import HeroTeardown from './HeroTeardown.astro';

const TEARDOWN = {
  id: 47,
  name: 'Dell XPS 13',
  brand: 'Dell',
  weightG: 1190,
  productType: 'Laptop',
  parts: [
    { name: 'Battery pack', weightG: 212, share: 0.684 },
    {
      name: 'Mainboard',
      weightG: 98,
      share: 0.316,
      children: [{ name: 'PCB assembly', weightG: 74 }],
    },
    { name: 'Shell', weightG: null, share: null },
  ],
  photos: [{ url: '/media/a.jpg', alt: 'Dell XPS 13, photographed during disassembly' }],
};
async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(HeroTeardown, { props: { teardown: TEARDOWN, ...props } });
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

  it('renders a mass bar sized by the share only for weighed parts', async () => {
    const html = await render({});
    expect(html).toContain('--share: 0.684');
    expect(html).toContain('--share: 0.316');
    // Two weighed parts -> exactly two inline shares; the unweighed Shell gets none.
    expect(html.match(/style="--share:/g)).toHaveLength(2);
  });

  it('shows the product type as a tag and omits it when absent', async () => {
    const html = await render({});
    expect(html).toContain('data-product-type');
    expect(html).toContain('Laptop');

    const { productType, ...rest } = TEARDOWN;
    const withoutType = await render({ teardown: rest });
    expect(withoutType).not.toContain('data-product-type');
  });

  it('renders a disclosure with subcomponents only for parts with children', async () => {
    const html = await render({});
    // Only Mainboard has children -> exactly one <details>/<summary> pair.
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain('<summary');
    expect(html).toContain('PCB assembly');
    expect(html).toContain('74 g');

    const flat = await render({
      teardown: { ...TEARDOWN, parts: [{ name: 'Battery pack', weightG: 212, share: 1 }] },
    });
    expect(flat).not.toContain('<details');
  });

  it('keeps explicit list semantics on the nested subcomponent list', async () => {
    const html = await render({});
    expect(html.match(/role="list"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('omits the photo strip when there are no photos', async () => {
    const html = await render({ teardown: { ...TEARDOWN, photos: [] } });
    expect(html).not.toContain('data-photo-strip');
  });

  it('leaves the page thesis, CTA and totals to BrandHero', async () => {
    const html = await render({});
    expect(html).not.toContain('data-metrics');
    expect(html).not.toMatch(/Explore the dataset/);
    expect(html).not.toContain('<h1');
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
