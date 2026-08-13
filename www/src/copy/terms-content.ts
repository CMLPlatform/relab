interface TermsSection {
  title: string;
  paragraphs: string[];
}

// The contract half of the pair. The privacy policy is a notice about what we
// do with your data; this page is what you agree to when you contribute. They
// stay separate documents on purpose: a notice cannot carry a licence grant,
// and a licence grant should not bury a notice.
// NOTE: `version` is what accounts record as the terms they accepted, so it pairs with
// CURRENT_TERMS_VERSION in backend/app/api/auth/terms.py. Bump both together when the
// wording changes materially: tests/test_terms_version.py fails if they drift apart, and
// bumping re-prompts everyone still on the old version. A typo fix needs no bump.
export const termsContent = {
  version: 1,
  description: 'The terms you agree to when you contribute records, images, or notes to Relab.',
  title: 'Terms of use',
  lastUpdated: 'Version 1 · Last updated: August 13, 2026',
  intro:
    'These terms cover what you contribute to Relab and how it may be used. They are short on purpose.',
  sections: [
    {
      title: 'The licence you give us',
      paragraphs: [
        'When you contribute a product record, image, measurement, or note, you give Relab a worldwide, royalty-free, non-exclusive, perpetual, irrevocable, sublicensable licence to use, reproduce, adapt, publish, and distribute it, including in curated dataset releases.',
        'This is a licence, not a transfer. You keep the copyright in what you contribute, and you stay free to use it however you like.',
      ],
    },
    {
      title: 'How we license it onwards',
      paragraphs: [
        'Curated dataset releases are planned under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). No release has been published yet.',
        'We may move a later release to a newer version of CC BY, or to another licence that meets the Open Definition. We will not move it to a closed licence.',
      ],
    },
    {
      title: 'What you promise',
      paragraphs: [
        'You confirm that you made what you upload: you took the photographs yourself and wrote the measurements and notes yourself. Do not upload someone else’s photographs, or images and text copied from a manual, a datasheet, a catalogue, or another site.',
        'Photographing a product you took apart is exactly what Relab is for, and those photographs will show brand names, logos, model numbers and the design of the product itself. That is expected and is not a problem: you are not promising your photographs are free of other people’s trademarks, only that the photographs are yours.',
        'If you are not sure you hold the rights to something, do not upload it.',
      ],
    },
    {
      title: 'Credit',
      paragraphs: [
        'Contributors are credited collectively. A dataset release names Relab and its authors, and credits everyone who contributed records as a group; it does not name you individually. Your records appear under a code, not your username.',
        'CC BY 4.0 requires people who reuse a release to credit the release itself. That credit goes to Relab and its authors, which is the same collective form.',
        'Your own profile is separate. Your name and contributions stay visible in the app according to your profile settings, and that is where your work is attributed to you.',
      ],
    },
    {
      title: 'Published releases cannot be taken back',
      paragraphs: [
        'Once a dataset release is published, copies are out in the world and we cannot recall them.',
        'You can delete your account and your uploads at any time. That removes your records from the live platform, but it cannot retract anything already included in a published release.',
      ],
    },
  ] satisfies TermsSection[],
};
