import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import WhyRelab from './WhyRelab.astro';

describe('WhyRelab', () => {
  it('states the gap, the downstream move, and the return of value', async () => {
    const html = await (await AstroContainer.create()).renderToString(WhyRelab);
    expect(html).toContain('Why Relab exists');
    expect(html).toMatch(/scarce/);
    expect(html).toMatch(/repairers/);
    expect(html).toMatch(/composition insight/);
  });

  it('does not promise the contributor return as though it were shipped', async () => {
    const html = await (await AstroContainer.create()).renderToString(WhyRelab);
    // Paper 1 calls this the "future delivery" of sustainability metrics and
    // repair guidance, and an assumption the pilot did not test. It named an
    // R-strategy recommendation, which is also analysis the platform never does.
    expect(html).not.toMatch(/R-strategy/);
    expect(html).toMatch(/designed for, not yet delivered/);
  });

  it('never uses the forbidden brand phrasing', async () => {
    const html = await (await AstroContainer.create()).renderToString(WhyRelab);
    expect(html).not.toMatch(/Reverse Engineering Lab/i);
    expect(html).not.toMatch(/R9lab/);
  });
});
