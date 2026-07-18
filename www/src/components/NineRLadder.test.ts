import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import NineRLadder from './NineRLadder.astro';

const render = async () => (await AstroContainer.create()).renderToString(NineRLadder);

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

  it('credits the source', async () => {
    const html = await render();
    expect(html).toContain('Potting');
    expect(html).toContain('pbl.nl');
  });

  it('does not claim there are nine strategies', async () => {
    const html = await render();
    expect(html).not.toMatch(/nine strategies/i);
  });
});
