import { describe, expect, it } from 'vitest';

import { readPublicSiteConfig, readSiteUrl } from './public.ts';

const VALID_PUBLIC_ENV: [string, string][] = [
  ['PUBLIC_APP_URL', 'https://app.example.com'],
  ['PUBLIC_CONTACT_EMAIL', 'team@example.com'],
  ['PUBLIC_DOCS_URL', 'https://docs.example.com'],
  ['PUBLIC_SITE_URL', 'https://example.com'],
];

function envFixture(entries: [string, string][]) {
  return Object.fromEntries(entries) as Record<string, string>;
}

function publicEnv(overrides: [string, string][]) {
  return envFixture([...VALID_PUBLIC_ENV, ...overrides]);
}

describe('readSiteUrl', () => {
  it('uses PUBLIC_SITE_URL, then fallback when reading the site URL', () => {
    expect(
      readSiteUrl(
        envFixture([
          ['PUBLIC_SITE_URL', 'https://public.example.com'],
          ['SITE_URL', 'https://site.example.com'],
        ]),
        'https://fallback.example.com',
      ),
    ).toBe('https://public.example.com');

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
      siteUrl: 'https://example.com',
    });
  });

  it('falls back to the default contact email when blank', () => {
    expect(readPublicSiteConfig(publicEnv([['PUBLIC_CONTACT_EMAIL', '   ']]))).toEqual({
      appUrl: 'https://app.example.com',
      contactEmail: 'relab@cml.leidenuniv.nl',
      docsUrl: 'https://docs.example.com',
      siteUrl: 'https://example.com',
    });
  });

  it('defaults missing URL vars to the production origins', () => {
    expect(readPublicSiteConfig({})).toEqual({
      appUrl: 'https://app.cml-relab.org',
      contactEmail: 'relab@cml.leidenuniv.nl',
      docsUrl: 'https://docs.cml-relab.org',
      siteUrl: 'https://cml-relab.org',
    });
  });

  it('defaults a blank URL var to its production origin', () => {
    expect(readPublicSiteConfig(publicEnv([['PUBLIC_APP_URL', '   ']])).appUrl).toBe(
      'https://app.cml-relab.org',
    );
  });

  it('rejects non-http public URL configuration', () => {
    expect(() =>
      readPublicSiteConfig(publicEnv([['PUBLIC_APP_URL', 'javascript:alert(1)']])),
    ).toThrow('PUBLIC_APP_URL must be an http(s) URL');
    expect(() =>
      readPublicSiteConfig(publicEnv([['PUBLIC_DOCS_URL', 'mailto:team@example.com']])),
    ).toThrow('PUBLIC_DOCS_URL must be an http(s) URL');
  });
});
