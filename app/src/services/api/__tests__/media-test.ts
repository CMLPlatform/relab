import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { getResizedImageUrl, resolveApiMediaUrl } from '../media';

const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_URL;

describe('resolveApiMediaUrl', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
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

  it.each([
    'blob:http://localhost/abc',
    'file:///data/image.jpg',
    'content://media/image/1',
  ])('passes through local image URI %s unchanged', (uri) => {
    expect(resolveApiMediaUrl(uri)).toBe(uri);
  });

  it('prepends the API base URL to root-relative paths', () => {
    expect(resolveApiMediaUrl('/uploads/images/test.jpg')).toBe(
      'http://localhost:8000/uploads/images/test.jpg',
    );
  });

  it('prepends the API base URL to relative paths without a leading slash', () => {
    expect(resolveApiMediaUrl('uploads/images/test.jpg')).toBe(
      'http://localhost:8000/uploads/images/test.jpg',
    );
  });
});

describe('getResizedImageUrl', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_ENV;
  });

  it('returns the resolved image URL when imageId is provided', () => {
    const result = getResizedImageUrl('/uploads/img.jpg', '7', 400);
    expect(result).toBe('http://localhost:8000/uploads/img.jpg');
  });

  it('returns resolved original URL when imageId is undefined', () => {
    const result = getResizedImageUrl('/uploads/img.jpg', undefined, 400);
    expect(result).toBe('http://localhost:8000/uploads/img.jpg');
  });

  it('returns resolved original URL for blob: URI (no resize)', () => {
    const result = getResizedImageUrl('blob:http://localhost/abc', '5', 400);
    expect(result).toBe('blob:http://localhost/abc');
  });

  it('returns resolved original URL for file: URI (no resize)', () => {
    const result = getResizedImageUrl('file:///data/image.jpg', '5', 400);
    expect(result).toBe('file:///data/image.jpg');
  });

  it('returns undefined when the image URL is unsafe', () => {
    const result = getResizedImageUrl('javascript:alert(1)', '5', 400);
    expect(result).toBeUndefined();
  });
});
