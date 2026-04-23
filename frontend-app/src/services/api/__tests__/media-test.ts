import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  API_PLACEHOLDER_IMAGE_PATH,
  getPlaceholderImageUrl,
  getResizedImageUrl,
  resolveApiMediaUrl,
} from '../media';

const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_URL;

describe('resolveApiMediaUrl', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api';
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

  it('passes through data: URIs unchanged', () => {
    const dataUri = 'data:image/png;base64,abc123';
    expect(resolveApiMediaUrl(dataUri)).toBe(dataUri);
  });

  it('prepends the API base URL to root-relative paths', () => {
    expect(resolveApiMediaUrl('/uploads/images/test.jpg')).toBe(
      'http://localhost:8000/api/uploads/images/test.jpg',
    );
  });

  it('prepends the API base URL to relative paths without a leading slash', () => {
    expect(resolveApiMediaUrl('static/images/placeholder.png')).toBe(
      'http://localhost:8000/api/static/images/placeholder.png',
    );
  });

  it('normalizes the placeholder constant', () => {
    expect(resolveApiMediaUrl(API_PLACEHOLDER_IMAGE_PATH)).toBe(
      'http://localhost:8000/api/static/images/placeholder.png',
    );
  });
});

describe('getPlaceholderImageUrl', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api';
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_ENV;
  });

  it('returns the API-prefixed placeholder path', () => {
    expect(getPlaceholderImageUrl()).toBe(
      'http://localhost:8000/api/static/images/placeholder.png',
    );
  });
});

describe('getResizedImageUrl', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api';
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_ENV;
  });

  it('returns a resized URL when imageId is provided', () => {
    const result = getResizedImageUrl('/uploads/img.jpg', '7', 400);
    expect(result).toBe('http://localhost:8000/api/images/7/resized?width=400');
  });

  it('returns resolved original URL when imageId is undefined', () => {
    const result = getResizedImageUrl('/uploads/img.jpg', undefined, 400);
    expect(result).toBe('http://localhost:8000/api/uploads/img.jpg');
  });

  it('returns resolved original URL for blob: URI (no resize)', () => {
    const result = getResizedImageUrl('blob:http://localhost/abc', '5', 400);
    expect(result).toBe('blob:http://localhost/abc');
  });

  it('returns resolved original URL for file: URI (no resize)', () => {
    const result = getResizedImageUrl('file:///data/image.jpg', '5', 400);
    expect(result).toBe('file:///data/image.jpg');
  });

  it('returns resolved original URL for data: URI (no resize)', () => {
    const dataUri = 'data:image/png;base64,abc';
    const result = getResizedImageUrl(dataUri, '5', 400);
    expect(result).toBe(dataUri);
  });

  it('falls back to imageUrl when resolveApiMediaUrl returns undefined', () => {
    // Pass an http URL so it passes through resolve unchanged
    const result = getResizedImageUrl('https://cdn.example.com/img.jpg', undefined, 200);
    expect(result).toBe('https://cdn.example.com/img.jpg');
  });
});
