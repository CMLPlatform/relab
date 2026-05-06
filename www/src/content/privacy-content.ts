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
  description: 'Privacy information for RELab accounts, contributions, and email preferences.',
  title: 'Privacy policy',
  lastUpdated: 'Last updated: May 6, 2026',
  intro: 'This policy explains what we collect, why we use it, and what choices you have.',
  sections: [
    {
      title: 'Account information',
      paragraphs: [
        'When you create an account, we ask for a username, email address, and password. We store passwords only in protected hashed form. We use your email to help you sign in and to send important service messages. We record when you log in successfully, but we do not keep full login IP addresses on your account.',
        'If you connect Google, GitHub, or YouTube, RELab stores the connection details encrypted. You can use Sign out everywhere in your profile to end active sessions for your account on other devices.',
      ],
    },
    {
      title: 'Contributions',
      paragraphs: [
        'Your profile and contribution statistics are public by default. You can change your profile to community-only or private in your profile settings. This changes who can see your profile details, statistics, and owner name. It does not make uploaded product records, files, images, or videos private.',
        'Product records, files, and images you upload may be public so the research dataset can be reused. We store uploads on our servers and include them in backups. We use them to show your contributions in RELab and for research when you choose to contribute.',
        'External videos load only after you choose to load them.',
        'You can delete your products and uploaded images in the app. If you need help, contact us and we will remove the related uploads and records.',
      ],
    },
    {
      title: 'AI and research use',
      paragraphs: [
        'We may use research contributions after removing direct account identifiers. We do not use your email, username, or password to train models.',
      ],
    },
    {
      title: 'Your rights',
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
