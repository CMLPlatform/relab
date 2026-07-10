import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import Hero from './Hero.astro';

describe('Hero', () => {
  it('renders the site title and the three action links from props', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Hero, {
      props: {
        appUrl: 'https://app.test',
        docsUrl: 'https://docs.test',
        githubUrl: 'https://github.test',
      },
    });

    expect(html).toContain('ReLab');
    expect(html).toContain('href="https://app.test"');
    expect(html).toContain('href="https://docs.test"');
    expect(html).toContain('href="https://github.test"');
  });
});
