import {
  isAllowedOAuthRedirectUrl,
  isExpectedOAuthCallbackUrl,
  parseOAuthCallbackUrl,
} from '@/services/api/oauthFlow';
import { describe, expect, it } from '@jest/globals';

describe('OAuth URL validation', () => {
  it('accepts the configured HTTPS provider authorization hosts', () => {
    expect(isAllowedOAuthRedirectUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true);
    expect(isAllowedOAuthRedirectUrl('https://github.com/login/oauth/authorize')).toBe(true);
  });

  it('rejects malformed, non-HTTPS, and unknown provider authorization URLs', () => {
    expect(isAllowedOAuthRedirectUrl('not a url')).toBe(false);
    expect(isAllowedOAuthRedirectUrl('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isAllowedOAuthRedirectUrl('https://evil.example.com/oauth')).toBe(false);
  });

  it('accepts callbacks whose scheme host and path match the generated redirect URI', () => {
    expect(
      isExpectedOAuthCallbackUrl('relab-app://account#status=success', 'relab-app://account'),
    ).toBe(true);
  });

  it('parses OAuth MFA handoff callback data from URL fragments', () => {
    expect(
      parseOAuthCallbackUrl('relab-app://login#status=mfa_required&mfa_handoff=handoff-token'),
    ).toEqual({
      status: 'mfa_required',
      mfaHandoff: 'handoff-token',
    });
  });

  it('parses OAuth error callback data from URL fragments', () => {
    expect(parseOAuthCallbackUrl('relab-app://login#status=error&error=access_denied')).toEqual({
      status: 'error',
      error: 'access_denied',
    });
  });

  it('rejects callbacks for a different scheme host or path', () => {
    expect(
      isExpectedOAuthCallbackUrl(
        'https://example.com/account#status=success',
        'relab-app://account',
      ),
    ).toBe(false);
    expect(
      isExpectedOAuthCallbackUrl('relab-app://login#status=success', 'relab-app://account'),
    ).toBe(false);
    expect(isExpectedOAuthCallbackUrl('not a url', 'relab-app://account')).toBe(false);
  });
});
