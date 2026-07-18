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
  });
});
