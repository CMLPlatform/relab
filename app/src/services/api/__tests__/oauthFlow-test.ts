import { describe, expect, it } from '@jest/globals';
import {
  isAllowedOAuthRedirectUrl,
  isExpectedOAuthCallbackUrl,
  parseOAuthCallbackUrl,
} from '@/services/api/oauthFlow';

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
      isExpectedOAuthCallbackUrl(
        'relab-app://profile?success=true&detail=ok',
        'relab-app://profile',
      ),
    ).toBe(true);
  });

  it('parses OAuth MFA handoff callback data from URL fragments', () => {
    expect(
      parseOAuthCallbackUrl('relab-app://login#success=false&mfa_handoff=handoff-token'),
    ).toEqual({
      success: false,
      mfaHandoff: 'handoff-token',
    });
  });

  it('rejects callbacks for a different scheme host or path', () => {
    expect(
      isExpectedOAuthCallbackUrl('https://example.com/profile?success=true', 'relab-app://profile'),
    ).toBe(false);
    expect(
      isExpectedOAuthCallbackUrl('relab-app://login?success=true', 'relab-app://profile'),
    ).toBe(false);
    expect(isExpectedOAuthCallbackUrl('not a url', 'relab-app://profile')).toBe(false);
  });
});
