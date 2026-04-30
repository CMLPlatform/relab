interface HomeStructuredDataInput {
  appUrl: string;
  docsUrl: string;
  linkedInUrl?: string;
  siteUrl: string;
}

const TRAILING_SLASH_PATTERN = /\/$/;
const siteMeta = {
  defaultDescription:
    'RELab is an open-source research platform for documenting the disassembly of durable goods and organising the resulting product data.',
  name: 'RELab',
  organization: 'CML, Leiden University',
  title: 'Reverse Engineering Lab',
};

export function buildHomeStructuredData({
  appUrl,
  docsUrl,
  linkedInUrl,
  siteUrl,
}: HomeStructuredDataInput) {
  const organizationSameAs = [siteLinks.github, linkedInUrl].filter(Boolean);
  const applicationSameAs = [docsUrl, siteLinks.github].filter(Boolean);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteMeta.name,
      url: siteUrl,
      description: siteMeta.defaultDescription,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteMeta.organization,
      url: siteUrl,
      logo: `${siteUrl.replace(TRAILING_SLASH_PATTERN, '')}/images/logo.png`,
      ...(organizationSameAs.length > 0 ? { sameAs: organizationSameAs } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: siteMeta.name,
      url: appUrl,
      applicationCategory: 'ResearchApplication',
      operatingSystem: 'Web',
      description: siteMeta.defaultDescription,
      isAccessibleForFree: true,
      sameAs: applicationSameAs,
      publisher: {
        '@type': 'Organization',
        name: siteMeta.organization,
      },
    },
  ];
}

export const siteLinks = {
  github: 'https://github.com/CMLPlatform/relab',
  youtube: 'https://www.youtube.com/@open_product_data',
};

export { siteMeta };
