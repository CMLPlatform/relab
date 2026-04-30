import { describe, expect, it } from '@jest/globals';

import { normalizeOptionalHttpUrl, normalizeRequiredHttpUrl } from './config';

describe('URL config helpers', () => {
  it('normalizes required http URLs and rejects executable schemes', () => {
    expect(normalizeRequiredHttpUrl('https://example.com/path/', 'EXAMPLE_URL')).toBe(
      'https://example.com/path/',
    );
    expect(() => normalizeRequiredHttpUrl('javascript:alert(1)', 'EXAMPLE_URL')).toThrow(
      'EXAMPLE_URL must be an http(s) URL',
    );
  });

  it('keeps optional URLs empty but rejects non-http values when set', () => {
    expect(normalizeOptionalHttpUrl(undefined, 'OPTIONAL_URL')).toBe('');
    expect(normalizeOptionalHttpUrl('  ', 'OPTIONAL_URL')).toBe('');
    expect(normalizeOptionalHttpUrl('https://docs.example.com', 'OPTIONAL_URL')).toBe(
      'https://docs.example.com/',
    );
    expect(() =>
      normalizeOptionalHttpUrl('data:text/html,<script>alert(1)</script>', 'OPTIONAL_URL'),
    ).toThrow('OPTIONAL_URL must be an http(s) URL');
  });
});
