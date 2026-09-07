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

  it('steps each rung one notch further down the stair, R0 to R9', async () => {
    const html = await render();
    // --step is what indents each rung, so it is the whole encoding of rank:
    // it must run 0-9 in order and keep descending across a tier boundary
    // (R2 -> R3 and R7 -> R8), not restart per tier.
    const steps = [...html.matchAll(/--step:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
