import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import SiteFooter from './SiteFooter.astro';

describe('SiteFooter', () => {
  it('renders the year, contact mailto, social links, and nested theme control', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(SiteFooter, {
      props: {
        contactEmail: 'team@relab.test',
        currentYear: 2031,
        githubUrl: 'https://github.test',
        linkedInUrl: 'https://linkedin.test',
        youtubeUrl: 'https://youtube.test',
      },
    });

    expect(html).toContain('2031');
    expect(html).toContain('href="mailto:team@relab.test"');
    expect(html).toContain('href="https://github.test"');
    expect(html).toContain('href="https://linkedin.test"');
    expect(html).toContain('href="https://youtube.test"');
    // The footer nests ThemeControl, so its markup renders too.
    expect(html).toContain('data-theme-control');
  });
});
