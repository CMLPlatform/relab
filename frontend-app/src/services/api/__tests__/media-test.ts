import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { resolveApiMediaUrl, getPlaceholderImageUrl, API_PLACEHOLDER_IMAGE_PATH } from '../media';

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
    expect(resolveApiMediaUrl('/uploads/images/test.jpg')).toBe('http://localhost:8000/api/uploads/images/test.jpg');
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
    expect(getPlaceholderImageUrl()).toBe('http://localhost:8000/api/static/images/placeholder.png');
  });
});
