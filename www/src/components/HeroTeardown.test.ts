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
    { name: 'Battery pack', weightG: 212, share: 0.684, photo: null },
    {
      name: 'Mainboard',
      weightG: 98,
      share: 0.316,
      photo: null,
      children: [{ name: 'PCB assembly', weightG: 74, photo: null }],
    },
    { name: 'Shell', weightG: null, share: null, photo: null },
  ],
  photos: [{ url: '/media/a.jpg', alt: 'Dell XPS 13, photographed during disassembly' }],
};

/** The same record once its components carry photographs: one has, one has not. */
const PLATED = {
  ...TEARDOWN,
  parts: [
    {
      ...TEARDOWN.parts[0],
      photo: {
        url: '/media/battery_200.webp',
        srcset: '/media/battery_200.webp 200w, /media/battery_800.webp 800w',
        alt: 'Photographed during disassembly',
      },
    },
    TEARDOWN.parts[1],
    TEARDOWN.parts[2],
  ],
};

const APP_URL = 'https://app.example.org';

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(HeroTeardown, {
    props: { teardown: TEARDOWN, appUrl: APP_URL, ...props },
  });
}

describe('HeroTeardown', () => {
  it('renders the product name and its parts with masses', async () => {
    const html = await render({});
    expect(html).toContain('Dell XPS 13');
    expect(html).toContain('Battery pack');
    expect(html).toContain('212 g');
  });

  it('renders an em dash with a spoken equivalent for a part with no recorded mass', async () => {
    const html = await render({});
    expect(html).not.toMatch(/null|NaN/);
    expect(html).toMatch(/aria-hidden="true"[^>]*>—<\/span>/);
    expect(html).toContain('mass not recorded');
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

  it('keeps explicit list semantics on the parts list and the nested subcomponent list', async () => {
    const html = await render({});
    expect(html).toMatch(/class="blueprint-parts[^"]*" role="list"/);
    expect(html).toMatch(/class="blueprint-subparts" role="list"/);
  });

  it('shows the assembled product above the schedule, and omits it when unphotographed', async () => {
    const html = await render({});
    expect(html).toContain('data-assembly');
    expect(html).toContain('/media/a.jpg');
    // The "before" comes before the parts it comes apart into.
    expect(html.indexOf('data-assembly')).toBeLessThan(html.indexOf('blueprint-parts'));

    const unphotographed = await render({ teardown: { ...TEARDOWN, photos: [] } });
    expect(unphotographed).not.toContain('data-assembly');
  });

  it('stays a plain list when no part is photographed', async () => {
    const html = await render({});
    expect(html).not.toContain('data-plates');
    expect(html).not.toContain('plate-figure');
  });

  it('becomes a plate grid as soon as one part is photographed', async () => {
    const html = await render({ teardown: PLATED });
    expect(html).toContain('data-plates');
    expect(html).toContain('/media/battery_200.webp');
    expect(html).toContain('alt="Photographed during disassembly"');
    // Every part gets a frame, photographed or not: three parts, three figures,
    // one image. The unphotographed two render as blank plates, not as gaps.
    expect(html.match(/plate-figure/g)).toHaveLength(3);
    expect(html.match(/<img/g)).toHaveLength(2); // the one photographed part + the assembly print
  });

  it('offers the wider derivatives to the browser, with a layout hint', async () => {
    const html = await render({ teardown: PLATED });
    expect(html).toContain('srcset="/media/battery_200.webp 200w, /media/battery_800.webp 800w"');
    // srcset widths mean nothing without sizes: the browser would assume 100vw
    // and fetch the largest file for a 180px plate.
    expect(html).toMatch(/sizes="[^"]*180px/);
  });

  it('emits no srcset or sizes when only one width exists', async () => {
    const single = {
      ...PLATED,
      parts: [{ ...PLATED.parts[0], photo: { url: '/media/b.webp', srcset: '', alt: 'Battery' } }],
    };
    const html = await render({ teardown: single });
    expect(html).toContain('/media/b.webp');
    expect(html).not.toContain('srcset');
    expect(html).not.toContain('sizes=');
  });

  it('numbers the plates in schedule order and hides the numbers from AT', async () => {
    const html = await render({ teardown: PLATED });
    // Astro appends a scoped-style attribute after aria-hidden, so match loosely
    // up to the tag close rather than pinning the attribute order.
    const indices = [...html.matchAll(/class="plate-index" aria-hidden="true"[^>]*>(\d+)</g)];
    expect(indices.map((match) => match[1])).toEqual(['1', '2', '3']);
  });

  it('prints sub-gram masses rather than rounding a recorded screw to "0 g"', async () => {
    const screws = {
      ...TEARDOWN,
      parts: [
        { name: 'Screws - big crosshead', weightG: 0.33, share: 0.001, photo: null },
        { name: 'Screw - Crosshead M3', weightG: 0.11, share: 0.001, photo: null },
        { name: '4GB RAM stick', weightG: 7.43, share: 0.02, photo: null },
        { name: 'Bottom Cover Assembly', weightG: 62.51, share: 0.2, photo: null },
      ],
    };
    const html = await render({ teardown: screws });
    expect(html).toContain('0.33 g');
    expect(html).toContain('0.11 g');
    expect(html).toContain('7.4 g');
    expect(html).toContain('63 g');
    // "0 g" claims no mass was recorded, which is what the em dash already says.
    expect(html).not.toMatch(/>0 g</);
  });

  it('caps the schedule at six parts and says what it left out', async () => {
    const many = {
      ...TEARDOWN,
      parts: Array.from({ length: 12 }, (_, i) => ({
        name: `Part ${i + 1}`,
        weightG: 100 - i,
        share: 0.08,
        photo: null,
      })),
    };
    const html = await render({ teardown: many });
    expect(html).toContain('Part 6');
    expect(html).not.toContain('Part 7');
    expect(html).toContain('Showing the 6 heaviest of 12 recorded parts');
  });

  it('states no extract when the whole schedule fits', async () => {
    const html = await render({});
    expect(html).not.toContain('data-extract');
  });

  it('seats each plate for the deal-out stagger', async () => {
    const html = await render({ teardown: PLATED });
    expect(html).toContain('--i: 0');
    expect(html).toContain('--i: 2');
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
    expect(html).toContain('illustrative masses');
    expect(html).not.toContain('№');
  });

  it('states provenance exactly once, under the title rather than above it', async () => {
    const html = await render({});
    expect(html.match(/data-provenance/g)).toHaveLength(1);
    // Below the heading: a caption on the record, not a kicker over it.
    expect(html.indexOf('blueprint-heading')).toBeLessThan(html.indexOf('blueprint-provenance'));
  });

  it('shows no example-data marker for live data', async () => {
    const html = await render({ fromFixture: false });
    expect(html).not.toContain('data-fixture-note');
    expect(html).not.toContain('Example teardown');
    expect(html).toContain('Teardown №47 · live record');
  });

  it('links a live record to its own page in the app', async () => {
    const html = await render({ fromFixture: false });
    expect(html).toContain(`href="${APP_URL}/products/47"`);
    expect(html).toContain('Open this record');
    // Evidence is a citation, not an outbound destination: the app is the same
    // product, so the link must not force a new tab.
    expect(html).not.toMatch(/<a[^>]*class="blueprint-open"[^>]*target=/);
  });

  it('sends the fixture to the record list rather than inventing a product URL', async () => {
    const html = await render({ fromFixture: true });
    expect(html).toContain(`href="${APP_URL}/products"`);
    expect(html).not.toContain(`/products/47`);
    expect(html).toContain('Browse the records');
  });

  it('does not double the slash when the app URL has a trailing one', async () => {
    const html = await render({ fromFixture: false, appUrl: 'https://app.example.org/' });
    expect(html).toContain('href="https://app.example.org/products/47"');
    expect(html).not.toContain('//products');
  });
});
