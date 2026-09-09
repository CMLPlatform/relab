import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  isAllowedOAuthRedirectUrl,
  isExpectedOAuthCallbackUrl,
  openOAuthBrowserSession,
  parseOAuthCallbackUrl,
} from '@/services/api/oauthFlow';

jest.mock('@/services/api/auth/authentication', () => ({
  fetchWithAuth: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const { fetchWithAuth } = jest.requireMock('@/services/api/auth/authentication') as {
  fetchWithAuth: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
};
const TIMED_OUT_PATTERN = /timed out/;

const { openAuthSessionAsync } = jest.requireMock('expo-web-browser') as {
  openAuthSessionAsync: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
};

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

  // The association flows pass the browser session's URL straight in, unvalidated.
  it('returns undefined for a malformed callback URL instead of throwing', () => {
    expect(parseOAuthCallbackUrl('not a url')).toBeUndefined();
    expect(parseOAuthCallbackUrl('')).toBeUndefined();
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

describe('buildOAuthAuthorizeUrl', () => {
  it('percent-encodes the redirect URI so a custom scheme survives the query string', () => {
    expect(buildOAuthAuthorizeUrl('/auth/google/authorize', 'relab-app://account')).toBe(
      '/auth/google/authorize?redirect_uri=relab-app%3A%2F%2Faccount',
    );
  });
});

describe('fetchOAuthAuthorizationUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GETs the login authorize route and returns the provider URL', async () => {
    fetchWithAuth.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth' }),
    } as never);

    await expect(fetchOAuthAuthorizationUrl('/auth/google/authorize')).resolves.toEqual({
      ok: true,
      status: 200,
      detail: undefined,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/auth/google/authorize', {});
  });

  // Association is a step-up: the password must travel in a POST body, never a query string.
  it('POSTs the step-up password as JSON when associating an account', async () => {
    fetchWithAuth.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authorization_url: 'https://github.com/login/oauth/authorize' }),
    } as never);

    await fetchOAuthAuthorizationUrl('/auth/github/associate/authorize', {
      currentPassword: 'hunter2',
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/auth/github/associate/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'hunter2' }),
    });
  });

  it('sends an empty body for a step-up that needs no password', async () => {
    fetchWithAuth.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as never);

    await fetchOAuthAuthorizationUrl('/auth/github/associate/authorize', {});

    expect((fetchWithAuth.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe('{}');
  });

  it('reports the server detail and no URL when authorize is refused', async () => {
    fetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Password is incorrect.' }),
    } as never);

    await expect(fetchOAuthAuthorizationUrl('/auth/github/associate/authorize')).resolves.toEqual({
      ok: false,
      status: 403,
      detail: 'Password is incorrect.',
      authorizationUrl: undefined,
    });
  });

  it('survives a non-JSON error body', async () => {
    fetchWithAuth.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as never);

    await expect(fetchOAuthAuthorizationUrl('/auth/google/authorize')).resolves.toMatchObject({
      ok: false,
      status: 502,
      detail: undefined,
      authorizationUrl: undefined,
    });
  });
});

describe('openOAuthBrowserSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the browser session result', async () => {
    openAuthSessionAsync.mockResolvedValueOnce({ type: 'success', url: 'relab-app://account' });

    await expect(
      openOAuthBrowserSession('https://github.com/login/oauth/authorize', 'relab-app://account'),
    ).resolves.toEqual({ type: 'success', url: 'relab-app://account' });
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize',
      'relab-app://account',
    );
  });

  // A browser session the user abandons never settles, so the caller would hang
  // on a pending sign-in forever without this.
  it('rejects once the timeout elapses', async () => {
    openAuthSessionAsync.mockReturnValueOnce(new Promise(() => {}));

    const pending = openOAuthBrowserSession('https://github.com/login', 'relab-app://account', 50);
    const assertion = expect(pending).rejects.toThrow(TIMED_OUT_PATTERN);
    jest.advanceTimersByTime(50);
    await assertion;
  });

  it('clears the timeout once the session settles, leaving no pending timer', async () => {
    openAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' });

    await openOAuthBrowserSession('https://github.com/login', 'relab-app://account', 50);

    expect(jest.getTimerCount()).toBe(0);
  });
});
