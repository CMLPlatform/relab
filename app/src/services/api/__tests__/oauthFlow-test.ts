import { describe, expect, it } from '@jest/globals';
import { isAllowedOAuthRedirectUrl, isExpectedOAuthCallbackUrl } from '@/services/api/oauthFlow';

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
      isExpectedOAuthCallbackUrl('relab://profile?success=true&detail=ok', 'relab://profile'),
    ).toBe(true);
  });

  it('rejects callbacks for a different scheme host or path', () => {
    expect(
      isExpectedOAuthCallbackUrl('https://example.com/profile?success=true', 'relab://profile'),
    ).toBe(false);
    expect(isExpectedOAuthCallbackUrl('relab://login?success=true', 'relab://profile')).toBe(false);
    expect(isExpectedOAuthCallbackUrl('not a url', 'relab://profile')).toBe(false);
  });
});
