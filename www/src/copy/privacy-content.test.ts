import { describe, expect, it } from 'vitest';

import { privacyContent } from './privacy-content.ts';

describe('privacyContent', () => {
  it('keeps rich privacy copy as structured data instead of HTML strings', () => {
    const rights = privacyContent.sections.find((section) => section.title === 'Your rights');

    expect(rights?.paragraphs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Contact',
          link: { href: 'mailto:relab@cml.leidenuniv.nl', text: 'relab@cml.leidenuniv.nl' },
        }),
      ]),
    );
    expect(JSON.stringify(rights)).not.toContain('<a ');
    expect(JSON.stringify(rights)).not.toContain('<strong>');
  });

  it('explains the current privacy controls for sessions, embeds, and linked accounts', () => {
    const text = JSON.stringify(privacyContent);

    expect(text).toContain('full login IP addresses on your account');
    expect(text).toContain('Sign out everywhere');
    expect(text).toContain('encrypted');
    expect(text).toContain('External videos load only after you choose to load them.');
  });
});
