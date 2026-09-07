import { afterEach, describe, expect, it, vi } from 'vitest';

import { backendApiUrlForMode, normalizeBackendApiUrl } from './backend-api.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeBackendApiUrl', () => {
  it('trims whitespace and strips trailing slashes', () => {
    expect(normalizeBackendApiUrl('  https://api.example.com///  ')).toBe('https://api.example.com');
  });

  it('preserves a path while stripping only trailing slashes', () => {
    expect(normalizeBackendApiUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });

  it('rejects a non-absolute URL', () => {
    expect(() => normalizeBackendApiUrl('api.example.com')).toThrow('absolute http(s) URL');
  });

  it('rejects a non-http(s) protocol', () => {
    expect(() => normalizeBackendApiUrl('ftp://api.example.com')).toThrow('http or https');
  });
});

describe('backendApiUrlForMode', () => {
  it('prefers the configured PUBLIC_BACKEND_API_URL over the mode fallback', () => {
    vi.stubEnv('PUBLIC_BACKEND_API_URL', 'https://configured.example.com/');
    expect(backendApiUrlForMode('prod')).toBe('https://configured.example.com');
  });

  it('falls back to the per-mode default when unconfigured', () => {
    vi.stubEnv('PUBLIC_BACKEND_API_URL', '');
    expect(backendApiUrlForMode('staging')).toBe('https://api-test.cml-relab.org');
  });

  it('falls back to prod for an unknown mode', () => {
    vi.stubEnv('PUBLIC_BACKEND_API_URL', '');
    expect(backendApiUrlForMode('nonsense')).toBe('https://api.cml-relab.org');
  });
});
