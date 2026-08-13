import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import MethodSteps from './MethodSteps.astro';

const render = async () =>
  (await AstroContainer.create()).renderToString(MethodSteps, {
    props: { docsUrl: 'https://docs.example.com' },
  });

describe('MethodSteps', () => {
  it('renders every workflow step, in order', async () => {
    const html = await render();
    const order = [
      'Product in',
      'Photograph',
      'Register product',
      'Identify',
      'Weigh and measure',
      'Nest into component hierarchy',
      'Publish to open dataset',
      'LCA and circular-economy research',
    ];
    const positions = order.map((label) => html.indexOf(label));
    expect(positions.every((p) => p > -1)).toBe(true);
    // Unlike the mermaid source this replaced, markup order is the workflow
    // order, so it can be asserted directly.
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });

  it('groups the steps into the three passes, and marks the one that loops', async () => {
    const html = await render();
    expect(html).toContain('Intake');
    expect(html).toContain('For each component');
    expect(html).toContain('repeats per part');
    expect(html.match(/class="flow-phase"/g)).toHaveLength(3);
  });

  it('splits the eight steps 3/2/3 across the passes', async () => {
    const html = await render();
    // The middle pass is the loop, and it holds exactly the two steps the
    // source diagram puts inside its subgraph: nesting happens after it, not
    // within it. Getting that wrong would misdescribe the documented workflow.
    const perPhase = html
      .split('class="flow-phase"')
      .slice(1)
      .map((phase) => (phase.match(/class="flow-step"/g) ?? []).length);
    expect(perPhase).toEqual([3, 2, 3]);
  });

  it('ships each step description as text, not as a hover-only tooltip', async () => {
    const html = await render();
    expect(html.match(/class="flow-step-detail"/g)).toHaveLength(8);
    expect(html).toContain('Record mass and dimensions for every component.');
    // No diagram left to hover: the descriptions are in the open.
    expect(html).not.toContain('<title>');
    expect(html).not.toContain('popover');
  });

  it('names the 9R framework and links the docs, without teaching it', async () => {
    const html = await render();
    expect(html).toContain('https://docs.example.com/project/9r-framework/');
    // The ten strategies and their definitions belong beside each other, in the
    // docs; the landing page only needs to say the framing exists.
    expect(html).not.toContain('Remanufacture');
    expect(html).not.toContain('Incineration');
  });

  it('does not claim the platform applies the 9R framework to records', async () => {
    const html = await render();
    // Relab collects data; the research that uses it does the interpreting.
    // Saying records are "read through" the framework describes a step the
    // platform has never performed.
    expect(html).not.toMatch(/read through the 9R/i);
    expect(html).not.toMatch(/records are (scored|ranked|classified|assessed)/i);
    // Neither paper uses the framework as an analytical frame, so the page
    // marks it as background rather than as part of the method.
    expect(html).toMatch(/Background:/);
    expect(html).toMatch(/takes its cue from/i);
  });

  it('carries no inlined SVG', async () => {
    const html = await render();
    // The mermaid variants cost ~44KB inlined and fixed the label size into
    // vector units; the workflow is a straight line and never needed a graph
    // layout engine.
    expect(html).not.toContain('<svg');
  });
});
