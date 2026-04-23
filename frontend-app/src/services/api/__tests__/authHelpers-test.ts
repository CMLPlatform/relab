import { describe, expect, it } from '@jest/globals';
import {
  extractApiErrorDetail,
  getAuthLoginPath,
  getAuthRefreshPath,
  mapApiUserToUser,
  shouldSkipUserFetch,
} from '../authHelpers';

describe('authHelpers', () => {
  it('returns the correct login path for web and native', () => {
    expect(getAuthLoginPath(true)).toBe('/auth/cookie/login');
    expect(getAuthLoginPath(false)).toBe('/auth/bearer/login');
  });

  it('returns the correct refresh path for web and native', () => {
    expect(getAuthRefreshPath(true)).toBe('/auth/cookie/refresh');
    expect(getAuthRefreshPath(false)).toBe('/auth/refresh');
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
        username: null,
        oauth_accounts: undefined,
        preferences: undefined,
      } as never),
    ).toEqual({
      id: 7,
      email: 'dev@example.com',
      isActive: true,
      isSuperuser: false,
      isVerified: true,
      username: 'Username not defined',
      oauth_accounts: [],
      preferences: {},
    });
  });

  it('extracts nested and flat API error details', () => {
    expect(extractApiErrorDetail({ detail: 'Flat error' }, 'fallback')).toBe('Flat error');
    expect(extractApiErrorDetail({ detail: { message: 'Nested message' } }, 'fallback')).toBe(
      'Nested message',
    );
    expect(extractApiErrorDetail({ detail: { reason: 'Nested reason' } }, 'fallback')).toBe(
      'Nested reason',
    );
    expect(extractApiErrorDetail(null, 'fallback')).toBe('fallback');
  });
});
