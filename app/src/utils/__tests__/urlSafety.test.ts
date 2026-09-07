import { describe, expect, it } from '@jest/globals';
import { isSafeImageUrl } from '@/utils/urlSafety';

describe('isSafeImageUrl', () => {
  it('accepts same-origin relative paths', () => {
    expect(isSafeImageUrl('/v1/files/photo.png')).toBe(true);
    expect(isSafeImageUrl('/media/thumb.jpg')).toBe(true);
  });

  it('accepts allowed absolute schemes', () => {
    expect(isSafeImageUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isSafeImageUrl('file:///tmp/a.png')).toBe(true);
    expect(isSafeImageUrl('blob:abc')).toBe(true);
  });

  it('rejects protocol-relative and backslash-escaped hosts', () => {
    expect(isSafeImageUrl('//evil.com/x.png')).toBe(false);
    // Browsers normalise backslashes to slashes in http(s) URLs, so these
    // resolve to https://evil.com and must not be treated as relative.
    expect(isSafeImageUrl('/\\evil.com/x.png')).toBe(false);
    expect(isSafeImageUrl('\\\\evil.com/x.png')).toBe(false);
    expect(isSafeImageUrl('\\/evil.com/x.png')).toBe(false);
  });

  it('rejects unsafe schemes and empty values', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:text/html,x')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl(undefined)).toBe(false);
  });
});
