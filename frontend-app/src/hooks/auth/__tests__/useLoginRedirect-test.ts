import { describe, expect, it } from '@jest/globals';
import { getSafeRedirectTarget } from '@/hooks/auth/useLoginRedirect';

describe('getSafeRedirectTarget', () => {
  it.each([
    ['/products', '/products'],
    ['/products?filter=mine', '/products?filter=mine'],
    ['/nested/path', '/nested/path'],
  ])('accepts safe internal path %s', (input, expected) => {
    expect(getSafeRedirectTarget(input)).toBe(expected);
  });

  it.each([
    ['protocol-relative escape', '//evil.com/path'],
    ['absolute https URL', 'https://evil.com/path'],
    ['absolute http URL', 'http://evil.com/path'],
    ['missing leading slash', 'products'],
    ['empty string', ''],
    ['undefined', undefined],
    ['array (multi-value query param)', ['/a', '/b']],
  ])('rejects %s', (_label, input) => {
    expect(getSafeRedirectTarget(input as string | string[] | undefined)).toBeUndefined();
  });
});
