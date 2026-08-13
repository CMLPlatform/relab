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

  it('keeps the definitions out of the page body, in the hint popover only', async () => {
    const html = await render();
    // Each definition appears exactly twice, and both are attribute values:
    // `data-rung-hint` (read by the popover script) and `title` (the no-JS
    // fallback it replaces). Never as a text node, which would put a paragraph
    // of definition into a strip whose visible copy is names and tiers only.
    for (const definition of ['Incineration of materials', 'radically different product']) {
      // Twice, because each rung carries the text in both attributes.
      expect(html.split(definition)).toHaveLength(3);
      // Never after a `>`, which is where a text node would put it.
      expect(html).not.toMatch(new RegExp(`>[^<]*${definition}`));
    }
  });

  it('quotes the canonical definitions verbatim, matching the docs', async () => {
    const html = await render();
    // Source of record: docs/src/content/docs/project/9r-framework.md. The pair
    // readers actually confuse is Remanufacture/Repurpose, so both are pinned.
    expect(html).toContain(
      'Use parts of a discarded product in a new product with the same function.',
    );
    expect(html).toContain(
      'Use a discarded product or its parts in a new product with a different function.',
    );
    expect(html).toContain('Restore an old product and bring it up to date.');
  });

  it('steps each rung one notch further down the stair, R0 to R9', async () => {
    const html = await render();
    // --step is what indents each rung, so it is the whole encoding of rank:
    // it must run 0-9 in order and keep descending across a tier boundary
    // (R2 -> R3 and R7 -> R8), not restart per tier.
    const steps = [...html.matchAll(/--step:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('labels which end of the ladder is which', async () => {
    const html = await render();
    // The staircase shows the order; these say what the order means.
    expect(html).toContain('Most circular');
    expect(html).toContain('Last resort');
  });

  it('gives every rung a hint, with a no-JS title fallback', async () => {
    const html = await render();
    expect(html.match(/data-rung-hint=/g)).toHaveLength(10);
    // The `title` is what a visitor gets if the popover script never runs; the
    // script removes it once the popover is live so the two never double up.
    expect(html.match(/title="[^"]+"/g)?.length).toBeGreaterThanOrEqual(10);
    expect(html).toContain('id="nine-r-popover"');
  });

  it('does not claim there are nine strategies', async () => {
    const html = await render();
    expect(html).not.toMatch(/nine strategies/i);
  });
});
