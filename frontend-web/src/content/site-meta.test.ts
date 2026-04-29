import { describe, expect, it } from 'vitest';
import { buildHomeStructuredData } from './site-meta.ts';

const HOMEPAGE_SCHEMA_ENTRY_COUNT = 3;

describe('buildHomeStructuredData', () => {
  it('returns website, organization, and software application schema entries', () => {
    const entries = buildHomeStructuredData({
      appUrl: 'https://app.example.test',
      docsUrl: 'https://docs.example.test',
      linkedInUrl: 'https://www.linkedin.com/company/example',
      siteUrl: 'https://example.test',
    });

    expect(entries).toHaveLength(HOMEPAGE_SCHEMA_ENTRY_COUNT);
    expect(entries[0]).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'RELab',
      url: 'https://example.test',
    });
    expect(entries[1]).toMatchObject({
      '@type': 'Organization',
      name: 'CML, Leiden University',
      url: 'https://example.test',
    });
    expect(entries[2]).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'RELab',
      applicationCategory: 'ResearchApplication',
      url: 'https://app.example.test',
    });
  });

  it('keeps the stable public source link when linkedin is unavailable', () => {
    const entries = buildHomeStructuredData({
      appUrl: 'https://app.example.test',
      docsUrl: 'https://docs.example.test',
      siteUrl: 'https://example.test',
    });

    expect(entries[1]).toMatchObject({
      sameAs: ['https://github.com/CMLPlatform/relab'],
    });
  });
});
