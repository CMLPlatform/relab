interface AccessibilitySection {
  title: string;
  paragraphs: string[];
  items?: string[];
}

// The public accessibility statement, required of Leiden University public sites by the
// EU Web Accessibility Directive (EN 301 549).
//
// It claims partial conformance and names what is untested, which is both honest and
// what the Directive asks for. Every fact here is checkable in the repository: the axe
// tags in `e2e/helpers.ts`, the contrast unit tests, the 44px target rules. Keep it that
// way. When a gap closes, move its line from "What we have not checked" to "What we
// check" rather than deleting it.
export const accessibilityContent = {
  description: 'What we check, what we have not checked, and how to tell us about a barrier.',
  title: 'Accessibility statement',
  lastUpdated: 'Last updated: August 18, 2026',
  intro: 'This statement covers the Relab website, the documentation site, and the web app.',
  sections: [
    {
      title: 'How accessible Relab is',
      paragraphs: [
        'Relab aims to meet WCAG 2.2, level AA. It is partially conformant: some of it meets that standard and some has not been assessed.',
        'We target 2.2 because Leiden University’s public sites fall under the EU Web Accessibility Directive through EN 301 549.',
        'This is a self-evaluation by the people who build Relab. There has been no external audit.',
      ],
    },
    {
      title: 'What we check',
      paragraphs: [
        'Every release scans all three sites with axe, an accessibility testing tool, against the level A and AA rules for WCAG 2.0, 2.1, and 2.2.',
      ],
      items: [
        'Every text colour clears 4.5:1 against its background, in both the light and dark themes.',
        'Buttons, links, and icon controls are at least 44 by 44 pixels.',
        'Animations follow your operating system’s “reduce motion” setting.',
      ],
    },
    {
      title: 'What we have not checked',
      paragraphs: ['These are the gaps we know about.'],
      items: [
        'Nobody has worked through Relab by keyboard alone, or with a screen reader.',
        'Two criteria have no automated test available: 2.4.11 Focus Not Obscured and 2.4.13 Focus Appearance. We check those by hand.',
        'The app is tested in a browser, so VoiceOver and TalkBack are untested.',
        'Relab is in English only.',
        'Videos are embedded from YouTube. Captions are up to whoever published them.',
      ],
    },
  ] satisfies AccessibilitySection[],
  feedback: {
    title: 'Tell us what does not work',
    lead: 'If you cannot use something, email',
    trail: 'Tell us the page you were on and what went wrong.',
  },
};
