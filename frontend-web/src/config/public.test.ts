import { describe, expect, it } from 'vitest';

import { readPublicSiteConfig } from './public';

describe('readPublicSiteConfig', () => {
  it('reads all required public configuration', () => {
    expect(
      readPublicSiteConfig({
        PUBLIC_API_URL: 'https://api.example.com',
        PUBLIC_APP_URL: 'https://app.example.com',
        PUBLIC_CONTACT_EMAIL: 'team@example.com',
        PUBLIC_DOCS_URL: 'https://docs.example.com',
        PUBLIC_LINKEDIN_URL: 'https://linkedin.example.com/group',
        PUBLIC_SITE_URL: 'https://example.com',
      }),
    ).toEqual({
      apiUrl: 'https://api.example.com',
      appUrl: 'https://app.example.com',
      contactEmail: 'team@example.com',
      docsUrl: 'https://docs.example.com',
      linkedInUrl: 'https://linkedin.example.com/group',
      siteUrl: 'https://example.com',
    });
  });

  it('falls back to the default contact email and strips empty optional values', () => {
    expect(
      readPublicSiteConfig({
        PUBLIC_API_URL: 'https://api.example.com',
        PUBLIC_APP_URL: 'https://app.example.com',
        PUBLIC_CONTACT_EMAIL: '   ',
        PUBLIC_DOCS_URL: 'https://docs.example.com',
        PUBLIC_LINKEDIN_URL: ' ',
        PUBLIC_SITE_URL: 'https://example.com',
      }),
    ).toEqual({
      apiUrl: 'https://api.example.com',
      appUrl: 'https://app.example.com',
      contactEmail: 'relab@cml.leidenuniv.nl',
      docsUrl: 'https://docs.example.com',
      linkedInUrl: undefined,
      siteUrl: 'https://example.com',
    });
  });

  it('throws when a required env var is missing', () => {
    expect(() =>
      readPublicSiteConfig({
        PUBLIC_APP_URL: 'https://app.example.com',
        PUBLIC_DOCS_URL: 'https://docs.example.com',
        PUBLIC_SITE_URL: 'https://example.com',
      }),
    ).toThrow('Missing required public env var: PUBLIC_API_URL');
  });
});
