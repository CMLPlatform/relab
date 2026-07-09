import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { login, logout, revokeAllSessions } from '@/services/api/auth/authLogin';
import { authRuntime } from '@/services/api/auth/authRuntime';
import { TimeoutError } from '@/services/api/request';

jest.mock('@/services/api/auth/authSession', () => ({
  isWeb: jest.fn(() => false),
  loadStoredAccessToken: jest.fn(),
  loadStoredRefreshToken: jest.fn(),
  markWebSessionActive: jest.fn(),
}));

jest.mock('@/services/api/request', () => ({
  // Keep the real TimeoutError class so `instanceof` still discriminates.
  ...jest.requireActual<typeof import('@/services/api/request')>('@/services/api/request'),
  fetchWithTimeout: jest.fn(),
}));

describe('authLogin', () => {
  beforeEach(() => {
    authRuntime.token = undefined;
    authRuntime.user = undefined;
    authRuntime.refreshPromise = null;
    authRuntime.getUserPromise = null;
    authRuntime.explicitlyLoggedOut = false;
    authRuntime.authGeneration = 0;
    jest.clearAllMocks();
    const { isWeb, loadStoredAccessToken, loadStoredRefreshToken } = jest.requireMock(
      '@/services/api/auth/authSession',
    ) as {
      isWeb: jest.Mock;
      loadStoredAccessToken: jest.MockedFunction<() => Promise<string | undefined>>;
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
    };
    isWeb.mockReturnValue(false);
    loadStoredAccessToken.mockResolvedValue(undefined);
    loadStoredRefreshToken.mockResolvedValue(undefined);
  });

  it('returns and persists native bearer token on success', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'native-token', refresh_token: 'native-refresh-token' }),
    } as never);

    const persistAccessToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const persistRefreshToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const getUser = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);

    await expect(
      login('http://127.0.0.1:18010', 'user', 'pass', {
        persistAccessToken,
        persistRefreshToken,
        getUser,
      }),
    ).resolves.toEqual({ status: 'authenticated' });

    expect(persistAccessToken).toHaveBeenCalledWith('native-token');
    expect(persistRefreshToken).toHaveBeenCalledWith('native-refresh-token');
  });

  it('on web 204 login marks the session live and hydrates the user cache', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { isWeb, markWebSessionActive } = jest.requireMock('@/services/api/auth/authSession') as {
      isWeb: jest.Mock;
      markWebSessionActive: jest.Mock;
    };

    isWeb.mockReturnValue(true);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    const persistAccessToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const persistRefreshToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const getUser = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);

    await expect(
      login('http://127.0.0.1:18010', 'user', 'pass', {
        persistAccessToken,
        persistRefreshToken,
        getUser,
      }),
    ).resolves.toEqual({ status: 'authenticated' });

    expect(markWebSessionActive).toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith(true);
    // The 204 already carries both cookies: exactly one request, no refresh.
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  // Regression: a web 204 used to fire a redundant refresh whose expected 401
  // latched explicitlyLoggedOut=true, silently disabling refresh for the session.
  it('on web 204 login never leaves the session marked as logged out', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { isWeb } = jest.requireMock('@/services/api/auth/authSession') as { isWeb: jest.Mock };

    isWeb.mockReturnValue(true);
    authRuntime.explicitlyLoggedOut = true;
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await login('http://127.0.0.1:18010', 'user', 'pass', {
      persistAccessToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      persistRefreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getUser: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    });

    // markWebSessionActive is mocked here, so assert on the one thing login owns:
    // it must not perform a second (refresh) round-trip that can latch the flag.
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  // Regression: a native 2xx without an access_token used to report success,
  // routing into a signed-in UI whose every request 401s.
  it('rejects a native login response that carries no access token', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ token_type: 'bearer' }),
    } as never);

    const persistAccessToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      login('http://127.0.0.1:18010', 'user', 'pass', {
        persistAccessToken,
        persistRefreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        getUser: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('Invalid login response.');

    expect(persistAccessToken).not.toHaveBeenCalled();
  });

  // Regression: raw transport errors leaked to the login form.
  it.each([
    ['timeout', new TimeoutError(15_000)],
    ['network failure', new TypeError('Network request failed')],
  ])('replaces a raw %s with friendly copy', async (_label, thrown) => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };

    fetchWithTimeout.mockRejectedValueOnce(thrown as never);

    await expect(
      login('http://127.0.0.1:18010', 'user', 'pass', {
        persistAccessToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        persistRefreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        getUser: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('Unable to reach server. Please try again later.');
  });

  it('returns a discriminated MFA pending result from 202 responses', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({
        mfa_required: true,
        mfa_token: 'mfa-token',
      }),
    } as never);

    const result = await login('http://127.0.0.1:18010', 'user', 'pass', {
      persistAccessToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      persistRefreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getUser: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      status: 'mfa_required',
      mfaToken: 'mfa-token',
    });
  });

  it('preserves API error details for non-credential login failures', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };

    fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: 'Too many login attempts.' }),
    } as never);

    await expect(
      login('http://127.0.0.1:18010', 'user', 'pass', {
        persistAccessToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        persistRefreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        getUser: jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('Too many login attempts.');
  });

  it('clears cached auth state before calling logout endpoint', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const clearCachedAuthState = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 200 } as never);

    await logout('http://127.0.0.1:18010', clearCachedAuthState);

    expect(clearCachedAuthState).toHaveBeenCalled();
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/bearer/logout') }),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses stored native access and refresh tokens on logout after runtime cache is empty', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredAccessToken, loadStoredRefreshToken } = jest.requireMock(
      '@/services/api/auth/authSession',
    ) as {
      loadStoredAccessToken: jest.MockedFunction<() => Promise<string | undefined>>;
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
    };
    loadStoredAccessToken.mockResolvedValueOnce('stored-access-token');
    loadStoredRefreshToken.mockResolvedValueOnce('stored-refresh-token');
    const clearCachedAuthState = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await logout('http://127.0.0.1:18010', clearCachedAuthState);

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/bearer/logout') }),
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: 'stored-refresh-token' }),
        headers: expect.objectContaining({ Authorization: 'Bearer stored-access-token' }),
      }),
    );
  });

  it('revokes all sessions through the shared endpoint and clears cached state first', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredAccessToken } = jest.requireMock('@/services/api/auth/authSession') as {
      loadStoredAccessToken: jest.MockedFunction<() => Promise<string | undefined>>;
    };
    loadStoredAccessToken.mockResolvedValueOnce('stored-access-token');
    const clearCachedAuthState = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await revokeAllSessions('http://127.0.0.1:18010', clearCachedAuthState);

    expect(clearCachedAuthState).toHaveBeenCalled();
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/sessions/revoke-all') }),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer stored-access-token' }),
      }),
    );
  });
});
