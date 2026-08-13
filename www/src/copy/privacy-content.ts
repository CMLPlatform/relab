type PrivacyParagraph =
  | string
  | {
      label: string;
      text: string;
      link?: {
        href: string;
        text: string;
      };
    };

interface PrivacySection {
  title: string;
  paragraphs: PrivacyParagraph[];
}

export const privacyContent = {
  description: 'Privacy information for Relab accounts, contributions, and email preferences.',
  title: 'Privacy policy',
  lastUpdated: 'Last updated: August 13, 2026',
  intro: 'This policy explains what we collect, how we use it, and what choices you have.',
  sections: [
    {
      title: 'Account information',
      paragraphs: [
        'When you create an account, we ask for a username, email address, and password. We store passwords only in protected hashed form. We use your email to help you sign in and to send important service messages. We record when you log in successfully, but we do not keep login IP addresses on your account.',
        'If you connect Google, GitHub, or YouTube, Relab stores the connection details encrypted. You can use “Sign out everywhere” in your profile to end active sessions on your other devices.',
      ],
    },
    {
      title: 'Contributions',
      paragraphs: [
        'Your profile and contribution statistics are public by default. You can change your profile to community-only or private in your profile settings. This changes who can see your profile details, statistics, and owner name. It does not make uploaded product records, files, images, or videos private.',
        'Product records, files, and images you upload are public. We store uploads on our servers and include them in backups. We use them to show your contributions in Relab, and we publish them in curated dataset releases so the research data can be cited and reused.',
        'Dataset releases are openly licensed under CC BY 4.0. No release has been published yet. Publication is irreversible: once a release is out, copies exist elsewhere and cannot be recalled. Deleting your account removes your records from the live platform, but it cannot retract anything already included in a published release.',
        'You can delete your products and uploaded images in the app. If you need help, contact us and we will remove the related uploads and records.',
      ],
    },
    {
      title: 'AI and research use',
      paragraphs: [
        'We may use research contributions after removing direct account identifiers. We do not use your email, username, or password to train models.',
        'An open licence lets anyone reuse a published release, including for commercial purposes and for training machine-learning models. We cannot restrict that, and we do not try to. Account identifiers are not published as part of a release.',
        'A release replaces your account with a stable contributor code, not your username. The same code is reused across releases, on purpose: it lets researchers tell which records came from one contributor without knowing who that is, which is what keeps a machine-learning model from being tested on the same person it was trained on. It is not anonymous — we keep the key that links a code back to an account, so we can answer questions about a release and correct it. That key is never published.',
        'A release never names you. Contributors are credited as a group, so your username does not appear in one at all. Your name stays on your profile in the app, where your profile settings control who sees it.',
      ],
    },
    {
      title: 'Cookies and local storage',
      paragraphs: [
        'Relab shows no cookie banner, because it stores nothing that needs your consent. There is no analytics, no advertising, and no tracking of any kind, on any of our sites.',
        'Three things are stored on your device. Your theme preference (light or dark) is kept in your browser’s local storage. Signing in sets an access cookie and a refresh cookie that keep you signed in. Signing in with Google or GitHub sets a short-lived cookie that protects that sign-in from tampering.',
        'All three are exempt from consent under article 11.7a of the Dutch Telecommunications Act: they are strictly necessary for a service you asked for, or they remember a preference you set yourself. We list them here because you are entitled to know what is stored, not because you have to agree to it.',
        'External videos are the exception, which is why they never load on their own. Choosing to load one sends your IP address and browser details to YouTube, and YouTube sets its own cookies under its own terms. That choice is yours to make, per video.',
      ],
    },
    {
      title: 'Your rights and choices',
      paragraphs: [
        {
          label: 'Updates',
          text: 'Project updates may be shared on GitHub and LinkedIn. Optional account update emails follow your account preferences.',
        },
        {
          label: 'Account holders',
          text: 'You can view and update your account details, and you can ask us to delete your account and related data.',
        },
        {
          label: 'Contact',
          text: 'for questions or data requests.',
          link: {
            href: 'mailto:relab@cml.leidenuniv.nl',
            text: 'relab@cml.leidenuniv.nl',
          },
        },
      ],
    },
  ] satisfies PrivacySection[],
};
