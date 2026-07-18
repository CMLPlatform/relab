import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import WhyRelab from './WhyRelab.astro';

describe('WhyRelab', () => {
  it('states the gap, the downstream move, and the return of value', async () => {
    const html = await (await AstroContainer.create()).renderToString(WhyRelab);
    expect(html).toContain('Why Relab exists');
    expect(html).toMatch(/scarce/);
    expect(html).toMatch(/repairers/);
    expect(html).toMatch(/R-strategy/);
  });

  it('never uses the forbidden brand phrasing', async () => {
    const html = await (await AstroContainer.create()).renderToString(WhyRelab);
    expect(html).not.toMatch(/Reverse Engineering Lab/i);
    expect(html).not.toMatch(/R9lab/);
  });
});
