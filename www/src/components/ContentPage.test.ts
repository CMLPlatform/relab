import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import ContentPage from './ContentPage.astro';

describe('ContentPage', () => {
  it('renders the title, optional meta and intro, and slotted content', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentPage, {
      props: { title: 'Privacy', meta: 'Updated 2031', intro: 'How we handle data.' },
      slots: { default: '<p>Body copy</p>' },
    });

    expect(html).toContain('Privacy');
    expect(html).toContain('Updated 2031');
    expect(html).toContain('How we handle data.');
    expect(html).toContain('Body copy');
  });

  it('omits the meta and intro paragraphs when those props are absent', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ContentPage, {
      props: { title: 'Bare' },
    });

    expect(html).toContain('Bare');
    expect(html).not.toContain('page-meta');
  });
});
