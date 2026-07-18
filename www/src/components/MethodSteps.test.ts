import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import MethodSteps from './MethodSteps.astro';

describe('MethodSteps', () => {
  it('renders the three steps in order', async () => {
    const html = await (await AstroContainer.create()).renderToString(MethodSteps);
    const positions = ['Disassemble', 'Weigh', 'Photograph'].map((s) => html.indexOf(s));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });
});
