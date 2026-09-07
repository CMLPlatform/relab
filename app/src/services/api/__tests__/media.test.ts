import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { pickThumbnailUrl, resolveApiMediaUrl, resolveApiMediaUrlMap } from '@/services/api/media';

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

describe('resolveApiMediaUrlMap', () => {
  it('resolves every width against the API origin', () => {
    expect(
      resolveApiMediaUrlMap({ '200': '/uploads/a_200.webp', '800': '/uploads/a_800.webp' }),
    ).toEqual({
      200: 'http://127.0.0.1:8010/uploads/a_200.webp',
      800: 'http://127.0.0.1:8010/uploads/a_800.webp',
    });
  });

  it('drops unsafe candidates and non-numeric widths, keeping the rest', () => {
    expect(
      resolveApiMediaUrlMap({
        '200': '/uploads/a_200.webp',
        '800': 'javascript:alert(1)',
        '1600': '//evil.test/a.webp',
        big: '/uploads/a_big.webp',
      }),
    ).toEqual({ 200: 'http://127.0.0.1:8010/uploads/a_200.webp' });
  });

  it('returns an empty map for a missing field', () => {
    expect(resolveApiMediaUrlMap(undefined)).toEqual({});
    expect(resolveApiMediaUrlMap(null)).toEqual({});
  });
});

describe('pickThumbnailUrl', () => {
  const urls = { 200: 'a_200', 800: 'a_800', 1600: 'a_1600' };

  it('takes the narrowest derivative that covers the need', () => {
    // 44pt row and 60pt filmstrip at 3x are still under 200.
    expect(pickThumbnailUrl(urls, 132)).toBe('a_200');
    expect(pickThumbnailUrl(urls, 200)).toBe('a_200');
    // A 390pt-wide gallery at 3x needs 1170.
    expect(pickThumbnailUrl(urls, 1170)).toBe('a_1600');
  });

  it('falls back to the widest available rather than overshooting into the original', () => {
    expect(pickThumbnailUrl(urls, 4000)).toBe('a_1600');
    // Sparse map: a narrow original generates no wide derivatives.
    expect(pickThumbnailUrl({ 200: 'a_200' }, 1170)).toBe('a_200');
  });

  it('returns undefined for an empty map so the caller keeps its own URL', () => {
    expect(pickThumbnailUrl({}, 800)).toBeUndefined();
  });
});
