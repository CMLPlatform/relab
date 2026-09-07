import { describe, expect, it } from '@jest/globals';
import {
  getAuthLoginPath,
  getAuthRefreshPath,
  mapApiUserToUser,
  shouldSkipUserFetch,
} from '@/services/api/auth/authHelpers';
import { parseApiErrorDetail } from '@/services/api/errors';

describe('authHelpers', () => {
  it('returns the correct login path for web and native', () => {
    expect(getAuthLoginPath(true)).toBe('/auth/session/login');
    expect(getAuthLoginPath(false)).toBe('/auth/bearer/login');
  });

  it('returns the correct refresh path for web and native', () => {
    expect(getAuthRefreshPath(true)).toBe('/auth/session/refresh');
    expect(getAuthRefreshPath(false)).toBe('/auth/bearer/refresh');
  });

  it('decides when user fetches should be skipped', () => {
    expect(
      shouldSkipUserFetch({
        forceRefresh: false,
        explicitlyLoggedOut: true,
        web: false,
        hasWebSession: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipUserFetch({
        forceRefresh: false,
        explicitlyLoggedOut: false,
        web: true,
        hasWebSession: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipUserFetch({
        forceRefresh: true,
        explicitlyLoggedOut: true,
        web: true,
        hasWebSession: false,
      }),
    ).toBe(false);
  });

  it('maps an API user into the frontend user shape', () => {
    expect(
      mapApiUserToUser({
        id: 7,
        email: 'dev@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: true,
        username: 'dev_user',
        oauth_accounts: undefined,
        preferences: undefined,
      } as never),
    ).toEqual({
      id: 7,
      email: 'dev@example.com',
      isActive: true,
      isSuperuser: false,
      isVerified: true,
      hasUsablePassword: true,
      username: 'dev_user',
      // A payload without role/quota maps to the least-privileged defaults rather
      // than to undefined: a missing role must never read as `lab`.
      role: 'contributor',
      termsAcceptanceRequired: false,
      uploadQuota: { files: 0, bytes: 0, usedFiles: 0, usedBytes: 0 },
      oauth_accounts: [],
      preferences: {},
    });
  });

  it('preserves null usernames for incomplete OAuth onboarding', () => {
    expect(
      mapApiUserToUser({
        id: 8,
        email: 'oauth@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: true,
        username: null,
        oauth_accounts: undefined,
        preferences: undefined,
      } as never),
    ).toEqual(
      expect.objectContaining({
        username: null,
      }),
    );
  });

  it('extracts nested and flat API error details', () => {
    expect(parseApiErrorDetail({ detail: 'Flat error' })).toBe('Flat error');
    expect(parseApiErrorDetail({ detail: { message: 'Nested message' } })).toBe('Nested message');
    expect(parseApiErrorDetail({ detail: { reason: 'Nested reason' } })).toBe('Nested reason');
    expect(parseApiErrorDetail({ detail: [{ msg: 'Validation failed' }] })).toBe(
      'Validation failed',
    );
    expect(parseApiErrorDetail(null)).toBeUndefined();
  });
});
