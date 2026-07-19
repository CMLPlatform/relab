import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import MethodSteps from './MethodSteps.astro';

const render = async () => (await AstroContainer.create()).renderToString(MethodSteps);

describe('MethodSteps', () => {
  it('renders every workflow node label', async () => {
    // Presence only: mermaid's DOM order puts the loop subgraph before the
    // intake node, so source order does not follow the visual flow.
    const html = await render();
    for (const label of [
      'Product in',
      'Photograph',
      'Register product',
      'Identify',
      'Weigh and measure',
      'component hierarchy',
      'open dataset',
      'research',
    ]) {
      expect(html).toContain(label);
    }
  });

  it('inlines both flowchart variants — horizontal for wide, vertical for narrow', async () => {
    const html = await render();
    expect(html).toContain('<figure class="method-flow');
    expect(html).toContain('id="method-flow"');
    expect(html).toContain('id="method-flow-tb"');
    // Labelled groups, not role="img": img is a leaf and cannot hold the
    // interactive step nodes the popover script adds.
    expect(html.match(/role="group"/g)).toHaveLength(2);
    // Theme adaptivity: the SVGs lean on page variables, not baked colours.
    expect(html).toContain('var(--color-primary)');
    expect(html).not.toContain('#1f4c96');
  });

  it('ships a description per node and a popover to show it', async () => {
    // Each variant carries the 8 <title>s — the accessible name and the no-JS
    // fallback; the script upgrades them into #method-flow-popover on the client.
    const html = await render();
    expect(html.match(/<title>/g)).toHaveLength(16);
    expect(html).toContain('<title>Record mass and dimensions for every component.</title>');
    expect(html).toContain('id="method-flow-popover"');
  });
});
