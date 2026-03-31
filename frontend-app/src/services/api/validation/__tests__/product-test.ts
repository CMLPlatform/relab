import { describe, expect, it } from '@jest/globals';
import { getProductNameHelperText, isValidUrl } from '../productSchema';

describe('isValidUrl', () => {
  it('returns false for undefined', () => {
    expect(isValidUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isValidUrl('   ')).toBe(false);
  });

  it('returns false for a non-URL string', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('returns false for ftp:// protocol', () => {
    expect(isValidUrl('ftp://example.com/file')).toBe(false);
  });

  it('returns true for http:// URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('returns true for https:// URL', () => {
    expect(isValidUrl('https://example.com/video')).toBe(true);
  });
});


describe('getProductNameHelperText', () => {
  it('returns a non-empty string', () => {
    const text = getProductNameHelperText();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});
