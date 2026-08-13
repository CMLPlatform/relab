import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import NineRLadder from './NineRLadder.astro';

const render = async () =>
  (await AstroContainer.create()).renderToString(NineRLadder, {
    props: { docsUrl: 'https://docs.example.com' },
  });

describe('NineRLadder', () => {
  it('renders all ten strategies in order, R0 through R9', async () => {
    const html = await render();
    const order = [
      'Refuse',
      'Rethink',
      'Reduce',
      'Re-use',
      'Repair',
      'Refurbish',
      'Remanufacture',
      'Repurpose',
      'Recycle',
      'Recover',
    ];
    const positions = order.map((name) => html.indexOf(name));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });

  it('renders the three tier headings', async () => {
    const html = await render();
    expect(html).toContain('Smarter product use and manufacture');
    expect(html).toContain('Extend lifespan of product and its parts');
    expect(html).toContain('Useful application of materials');
  });

  it('credits the source and links the full definitions in the docs', async () => {
    const html = await render();
    expect(html).toContain('Potting');
    expect(html).toContain('https://docs.example.com/project/9r-framework/');
    expect(html).toContain('(opens in new tab)');
    // Regression: Astro strips the inter-node newline before the <a>, which
    // once glued the source line to its link text.
    expect(html).toMatch(/\(2017\):\s+<a/);
  });

  it('keeps the definitions in the docs, not on the landing page', async () => {
    const html = await render();
    expect(html).not.toContain('Incineration');
    expect(html).not.toContain('radically different product');
  });

  it('gives every rung a short hint, with a no-JS title fallback', async () => {
    const html = await render();
    expect(html.match(/data-rung-hint=/g)).toHaveLength(10);
    // The `title` is what a visitor gets if the popover script never runs; the
    // script removes it once the popover is live so the two never double up.
    expect(html.match(/title="[^"]+"/g)?.length).toBeGreaterThanOrEqual(10);
    expect(html).toContain('id="nine-r-popover"');
  });

  it('paraphrases in the hints rather than restating the canonical wording', async () => {
    const html = await render();
    // Remanufacture and Repurpose are the pair readers actually confuse, so
    // the hints have to separate them without importing the docs' definitions.
    expect(html).toContain('keeping the same function');
    expect(html).toContain('for a different function');
    expect(html).not.toContain('Use parts of a discarded product in a new product');
  });

  it('does not claim there are nine strategies', async () => {
    const html = await render();
    expect(html).not.toMatch(/nine strategies/i);
  });
});
