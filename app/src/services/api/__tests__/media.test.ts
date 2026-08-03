import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resolveApiMediaUrl } from '@/services/api/media';

const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_URL;

describe('resolveApiMediaUrl', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:18010';
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_ENV;
  });

  it('returns undefined for null/undefined/empty paths', () => {
    expect(resolveApiMediaUrl(null)).toBeUndefined();
    expect(resolveApiMediaUrl(undefined)).toBeUndefined();
    expect(resolveApiMediaUrl('')).toBeUndefined();
  });

  it('passes through absolute http/https URLs unchanged', () => {
    expect(resolveApiMediaUrl('https://example.com/img.png')).toBe('https://example.com/img.png');
    expect(resolveApiMediaUrl('http://cdn.test/img.jpg')).toBe('http://cdn.test/img.jpg');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/a.png',
  ])('rejects unsafe image URI %s', (uri) => {
    expect(resolveApiMediaUrl(uri)).toBeUndefined();
  });

  it.each(['blob:http://localhost/abc', 'file:///data/image.jpg', 'content://media/image/1'])(
    'rejects local-scheme URI %s (only legitimate for on-device picks)',
    (uri) => {
      expect(resolveApiMediaUrl(uri)).toBeUndefined();
    },
  );

  it('prepends the API base URL to root-relative paths', () => {
    expect(resolveApiMediaUrl('/uploads/images/test.jpg')).toBe(
      'http://127.0.0.1:8010/uploads/images/test.jpg',
    );
  });

  it('prepends the API base URL to relative paths without a leading slash', () => {
    expect(resolveApiMediaUrl('uploads/images/test.jpg')).toBe(
      'http://127.0.0.1:8010/uploads/images/test.jpg',
    );
  });
});
