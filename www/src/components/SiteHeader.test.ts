import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import SiteHeader from './SiteHeader.astro';

const PROPS = {
  appUrl: 'https://app.example.com',
  docsUrl: 'https://docs.example.com',
};

const render = async (props: Record<string, unknown> = {}) =>
  (await AstroContainer.create()).renderToString(SiteHeader, { props: { ...PROPS, ...props } });

describe('SiteHeader', () => {
  it('renders the wordmark linking home and the two nav links', async () => {
    const html = await render();
    expect(html).toContain('aria-label="Relab"');
    expect(html).toContain('href="/"');
    expect(html).toContain('https://app.example.com');
    expect(html).toContain('https://docs.example.com');
    // Both leave the site, and each says so to a screen reader.
    expect(html.match(/\(opens in new tab\)/g)).toHaveLength(2);
  });

  it('leaves GitHub to the footer, so no link is offered twice', async () => {
    const html = await render();
    expect(html).not.toContain('github');
    expect(html).not.toContain('GitHub');
  });

  it('marks the brand for handoff only where a hero carries the mark', async () => {
    // The landing page hero shows the mark, so the header's fades in as that
    // one melts. Elsewhere there is nothing to hand off from, and starting it
    // hidden would leave the header nameless until the visitor scrolled.
    expect(await render({ heroBrand: true })).toContain('is-handoff');
    expect(await render()).not.toContain('is-handoff');
  });

  it('links both wordmark variants rather than inlining them', async () => {
    const html = await render();
    // Linked, not `set:html`-inlined: nothing in the header animates the mark's
    // geometry any more, so the two variants ship as hashed, cacheable URLs.
    expect(html).not.toContain('<svg');
    expect(html.match(/<img[^>]*class="brand-(light|dark)"/g)).toHaveLength(2);
    // Both carry intrinsic dimensions, so the bar cannot shift as they load.
    expect(html.match(/width="71" height="38"/g)).toHaveLength(2);
  });
});
