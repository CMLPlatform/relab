import { describe, expect, it } from 'vitest';

import { readPublicSiteConfig, readSiteUrl } from './public.ts';

const VALID_PUBLIC_ENV: [string, string][] = [
  ['PUBLIC_APP_URL', 'https://app.example.com'],
  ['PUBLIC_CONTACT_EMAIL', 'team@example.com'],
  ['PUBLIC_DOCS_URL', 'https://docs.example.com'],
  ['PUBLIC_LINKEDIN_URL', 'https://linkedin.example.com/group'],
  ['PUBLIC_SITE_URL', 'https://example.com'],
];

function envFixture(entries: [string, string][]) {
  return Object.fromEntries(entries) as Record<string, string>;
}

function publicEnv(overrides: [string, string][]) {
  return envFixture([...VALID_PUBLIC_ENV, ...overrides]);
}

describe('readSiteUrl', () => {
  it('prefers SITE_URL, then PUBLIC_SITE_URL, then fallback when reading the site URL', () => {
    expect(
      readSiteUrl(
        envFixture([
          ['PUBLIC_SITE_URL', 'https://public.example.com'],
          ['SITE_URL', 'https://site.example.com'],
        ]),
        'https://fallback.example.com',
      ),
    ).toBe('https://site.example.com');

    expect(
      readSiteUrl(
        envFixture([['PUBLIC_SITE_URL', 'https://public.example.com']]),
        'https://fallback.example.com',
      ),
    ).toBe('https://public.example.com');

    expect(readSiteUrl({}, 'https://fallback.example.com')).toBe('https://fallback.example.com');
  });
});

describe('readPublicSiteConfig', () => {
  it('reads all required public configuration', () => {
    expect(readPublicSiteConfig(envFixture(VALID_PUBLIC_ENV))).toEqual({
      appUrl: 'https://app.example.com',
      contactEmail: 'team@example.com',
      docsUrl: 'https://docs.example.com',
      linkedInUrl: 'https://linkedin.example.com/group',
      siteUrl: 'https://example.com',
    });
  });

  it('falls back to the default contact email and strips empty optional values', () => {
    expect(
      readPublicSiteConfig(
        publicEnv([
          ['PUBLIC_CONTACT_EMAIL', '   '],
          ['PUBLIC_LINKEDIN_URL', ' '],
        ]),
      ),
    ).toEqual({
      appUrl: 'https://app.example.com',
      contactEmail: 'relab@cml.leidenuniv.nl',
      docsUrl: 'https://docs.example.com',
      linkedInUrl: undefined,
      siteUrl: 'https://example.com',
    });
  });

  it('throws when a required env var is missing', () => {
    expect(() =>
      readPublicSiteConfig(
        envFixture([
          ['PUBLIC_DOCS_URL', 'https://docs.example.com'],
          ['PUBLIC_SITE_URL', 'https://example.com'],
        ]),
      ),
    ).toThrow('Missing required public env var: PUBLIC_APP_URL');
  });

  it('throws when a required env var is blank', () => {
    expect(() => readPublicSiteConfig(publicEnv([['PUBLIC_APP_URL', '   ']]))).toThrow(
      'Missing required public env var: PUBLIC_APP_URL',
    );
  });
});
