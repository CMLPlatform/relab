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
});
