import { describe, expect, it } from 'vitest';

import { joinApiUrl } from './url';

describe('joinApiUrl', () => {
  it('joins a base URL and absolute path', () => {
    expect(joinApiUrl('https://api.example.com', '/newsletter/subscribe')).toBe(
      'https://api.example.com/newsletter/subscribe',
    );
  });

  it('removes duplicate trailing slashes from base URL', () => {
    expect(joinApiUrl('https://api.example.com///', '/newsletter/subscribe')).toBe(
      'https://api.example.com/newsletter/subscribe',
    );
  });

  it('adds a leading slash when path is relative', () => {
    expect(joinApiUrl('https://api.example.com', 'newsletter/subscribe')).toBe(
      'https://api.example.com/newsletter/subscribe',
    );
  });

  it('handles a single trailing slash on base URL', () => {
    expect(joinApiUrl('https://api.example.com/', '/health')).toBe(
      'https://api.example.com/health',
    );
  });

  it('works with a path that is just a slash', () => {
    expect(joinApiUrl('https://api.example.com', '/')).toBe('https://api.example.com/');
  });

  it('throws a descriptive error when baseUrl is undefined (missing PUBLIC_API_URL)', () => {
    expect(() => joinApiUrl(undefined as unknown as string, '/path')).toThrow(
      'joinApiUrl: baseUrl is undefined; is PUBLIC_API_URL set?',
    );
  });

  it('throws a descriptive error when baseUrl is empty string', () => {
    expect(() => joinApiUrl('', '/path')).toThrow('joinApiUrl: baseUrl is');
  });

  it('preserves existing path segments on the base URL', () => {
    expect(joinApiUrl('https://api.example.com/v1', '/users')).toBe(
      'https://api.example.com/v1/users',
    );
  });
});
