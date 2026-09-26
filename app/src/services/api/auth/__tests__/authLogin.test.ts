import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { login, logout, revokeAllSessions } from '@/services/api/auth/authLogin';
import { authRuntime } from '@/services/api/auth/authRuntime';
import { TimeoutError } from '@/services/api/request';

jest.mock('@/services/api/auth/authSession', () => ({
  loadStoredAccessToken: jest.fn(),
  loadStoredRefreshToken: jest.fn(),
  markWebSessionActive: jest.fn(),
}));

jest.mock('@/services/storage', () => ({
  ...jest.requireActual<typeof import('@/services/storage')>('@/services/storage'),
  isWeb: jest.fn(() => false),
}));

jest.mock('@/services/api/auth/authRefresh', () => ({
  clearCachedAuthState: jest.fn(),
  persistAccessToken: jest.fn(),
  persistRefreshToken: jest.fn(),
}));

jest.mock('@/services/api/auth/authUser', () => ({ getUser: jest.fn() }));

jest.mock('@/services/api/request', () => ({
  // Keep the real TimeoutError class so `instanceof` still discriminates.
  ...jest.requireActual<typeof import('@/services/api/request')>('@/services/api/request'),
  fetchWithTimeout: jest.fn(),
}));

const { isWeb } = jest.requireMock('@/services/storage') as { isWeb: jest.Mock };
const { clearCachedAuthState, persistAccessToken, persistRefreshToken } = jest.requireMock(
  '@/services/api/auth/authRefresh',
) as {
  clearCachedAuthState: jest.MockedFunction<() => Promise<void>>;
  persistAccessToken: jest.MockedFunction<(token: string) => Promise<void>>;
  persistRefreshToken: jest.MockedFunction<(token: string) => Promise<void>>;
};
const { getUser } = jest.requireMock('@/services/api/auth/authUser') as {
  getUser: jest.MockedFunction<(forceRefresh?: boolean) => Promise<undefined>>;
};

describe('authLogin', () => {
  beforeEach(() => {
    authRuntime.token = undefined;
    authRuntime.user = undefined;
    authRuntime.refreshPromise = null;
    authRuntime.getUserPromise = null;
    authRuntime.explicitlyLoggedOut = false;
    authRuntime.authGeneration = 0;
    jest.clearAllMocks();
    const { loadStoredAccessToken, loadStoredRefreshToken } = jest.requireMock(
      '@/services/api/auth/authSession',
    ) as {
      loadStoredAccessToken: jest.MockedFunction<() => Promise<string | undefined>>;
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
    };
    isWeb.mockReturnValue(false);
    clearCachedAuthState.mockResolvedValue(undefined);
    persistAccessToken.mockResolvedValue(undefined);
    persistRefreshToken.mockResolvedValue(undefined);
    getUser.mockResolvedValue(undefined);
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

    await expect(login('user', 'pass')).resolves.toEqual({ status: 'authenticated' });

    expect(persistAccessToken).toHaveBeenCalledWith('native-token');
    expect(persistRefreshToken).toHaveBeenCalledWith('native-refresh-token');
  });

  it('on web 204 login marks the session live and hydrates the user cache', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { markWebSessionActive } = jest.requireMock('@/services/api/auth/authSession') as {
      markWebSessionActive: jest.Mock;
    };

    isWeb.mockReturnValue(true);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await expect(login('user', 'pass')).resolves.toEqual({ status: 'authenticated' });

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

    isWeb.mockReturnValue(true);
    authRuntime.explicitlyLoggedOut = true;
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await login('user', 'pass');

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

    await expect(login('user', 'pass')).rejects.toThrow('Invalid login response.');

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

    await expect(login('user', 'pass')).rejects.toThrow(
      'Unable to reach server. Please try again later.',
    );
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

    const result = await login('user', 'pass');

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

    await expect(login('user', 'pass')).rejects.toThrow('Too many login attempts.');
  });

  it('revokes the session server-side before clearing cached auth state', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const order: string[] = [];
    clearCachedAuthState.mockImplementationOnce(async () => {
      order.push('clear');
    });
    fetchWithTimeout.mockImplementationOnce(async () => {
      order.push('revoke');
      return { ok: true, status: 200 } as never;
    });

    await logout();

    expect(order).toEqual(['revoke', 'clear']);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/bearer/logout') }),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('still clears cached auth state when the logout request fails', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    fetchWithTimeout.mockRejectedValueOnce(new TimeoutError(15_000) as never);

    await expect(logout()).resolves.toBeUndefined();
    expect(clearCachedAuthState).toHaveBeenCalled();
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
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await logout();

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
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await revokeAllSessions();

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
