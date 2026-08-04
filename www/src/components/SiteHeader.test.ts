import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import SiteHeader from './SiteHeader.astro';

const PROPS = {
  appUrl: 'https://app.example.com',
  docsUrl: 'https://docs.example.com',
  githubUrl: 'https://github.com/example/relab',
};

describe('SiteHeader', () => {
  it('renders the wordmark linking home and the three nav links', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(SiteHeader, { props: PROPS });
    expect(html).toContain('aria-label="Relab"');
    expect(html).toContain('href="/"');
    expect(html).toContain('https://app.example.com');
    expect(html).toContain('https://docs.example.com');
    expect(html).toContain('https://github.com/example/relab');
    // All three leave the site, and each says so to a screen reader.
    expect(html.match(/\(opens in new tab\)/g)).toHaveLength(3);
  });

  it('reserves the wordmark box so the header does not shift on load', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(SiteHeader, { props: PROPS });
    expect(html.match(/width="70" height="38"/g)).toHaveLength(2);
  });
});
