import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';

import ThemeControl from './ThemeControl.astro';

describe('ThemeControl', () => {
  it('renders the theme toggle defaulting to the system theme', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeControl);

    expect(html).toContain('data-theme-control');
    expect(html).toContain('data-theme-current="system"');
    expect(html).toContain('data-theme-toggle');
  });
});
