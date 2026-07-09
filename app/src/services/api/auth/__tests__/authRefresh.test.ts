import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchWithAuth, refreshAuthToken } from '@/services/api/auth/authRefresh';
import { authRuntime } from '@/services/api/auth/authRuntime';

jest.mock('@/services/api/auth/authSession', () => ({
  // jest.fn (not a fixed arrow) so the web branch is reachable — pinning the
  // platform in the mock left half of refreshAuthToken untested.
  isWeb: jest.fn(() => false),
  hasWebSessionFlag: jest.fn(() => true),
  setWebSessionFlag: jest.fn(),
  loadStoredAccessToken: jest.fn(),
  loadStoredRefreshToken: jest.fn(),
  persistStoredAccessToken: jest.fn(),
  persistStoredRefreshToken: jest.fn(),
  clearStoredAccessToken: jest.fn(),
  clearStoredRefreshToken: jest.fn(),
}));

jest.mock('@/services/api/request', () => ({
  createRequestId: () => 'req-123',
  fetchWithTimeout: jest.fn(),
}));

const session = () =>
  jest.requireMock('@/services/api/auth/authSession') as {
    isWeb: jest.Mock;
    hasWebSessionFlag: jest.Mock;
    setWebSessionFlag: jest.Mock;
    loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
    persistStoredAccessToken: jest.Mock;
  };

const request = () => jest.requireMock('@/services/api/request') as { fetchWithTimeout: jest.Mock };

describe('authRefresh', () => {
  beforeEach(() => {
    authRuntime.token = undefined;
    authRuntime.user = undefined;
    authRuntime.refreshPromise = null;
    authRuntime.getUserPromise = null;
    authRuntime.explicitlyLoggedOut = false;
    authRuntime.authGeneration = 0;
    jest.clearAllMocks();
    session().isWeb.mockReturnValue(false);
    session().hasWebSessionFlag.mockReturnValue(true);
  });

  // Regression: this guard had zero coverage — deleting it left the suite green.
  it('single-flights concurrent refreshes into one request', async () => {
    const { fetchWithTimeout } = request();
    session().loadStoredRefreshToken.mockResolvedValue('rt');

    let release: (value: unknown) => void = () => {};
    fetchWithTimeout.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const first = refreshAuthToken('http://127.0.0.1:18010');
    const second = refreshAuthToken('http://127.0.0.1:18010');

    // Both calls suspend on loadStoredRefreshToken before reaching fetch.
    while (fetchWithTimeout.mock.calls.length === 0) await Promise.resolve();
    release({ ok: true, status: 200, json: async () => ({ access_token: 'fresh' }) });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  // Regression: the post-parse authGeneration re-check had zero coverage.
  it('does not persist a token when a logout lands while the body is parsing', async () => {
    const { fetchWithTimeout } = request();
    session().loadStoredRefreshToken.mockResolvedValueOnce('rt');

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        // A logout lands mid-stream: clearCachedAuthState bumps the generation.
        authRuntime.authGeneration++;
        return { access_token: 'resurrected' };
      },
    } as never);

    await expect(refreshAuthToken('http://127.0.0.1:18010')).resolves.toBe(false);
    expect(authRuntime.token).toBeUndefined();
    expect(session().persistStoredAccessToken).not.toHaveBeenCalled();
  });

  it('on web marks the session live without persisting any token', async () => {
    const { fetchWithTimeout } = request();
    session().isWeb.mockReturnValue(true);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 200 } as never);

    await expect(refreshAuthToken('http://127.0.0.1:18010')).resolves.toBe(true);
    expect(session().setWebSessionFlag).toHaveBeenCalledWith(true);
    expect(session().persistStoredAccessToken).not.toHaveBeenCalled();
    expect(authRuntime.explicitlyLoggedOut).toBe(false);
  });

  it('on web skips the refresh entirely when no session flag is set', async () => {
    const { fetchWithTimeout } = request();
    session().isWeb.mockReturnValue(true);
    session().hasWebSessionFlag.mockReturnValue(false);

    await expect(refreshAuthToken('http://127.0.0.1:18010')).resolves.toBe(false);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('stores refreshed token on native refresh success', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken, persistStoredAccessToken, persistStoredRefreshToken } =
      jest.requireMock('@/services/api/auth/authSession') as {
        loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
        persistStoredAccessToken: jest.Mock;
        persistStoredRefreshToken: jest.Mock;
      };
    loadStoredRefreshToken.mockResolvedValueOnce('old-refresh-token');

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fresh-token', refresh_token: 'fresh-refresh-token' }),
    } as never);

    await expect(refreshAuthToken('http://127.0.0.1:18010')).resolves.toBe(true);
    expect(authRuntime.token).toBe('fresh-token');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/bearer/refresh') }),
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: 'old-refresh-token' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(persistStoredAccessToken).toHaveBeenCalledWith('fresh-token');
    expect(persistStoredRefreshToken).toHaveBeenCalledWith('fresh-refresh-token');
  });

  it('retries an authenticated request after a 401 and refresh', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken } = jest.requireMock('@/services/api/auth/authSession') as {
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
    };
    loadStoredRefreshToken.mockResolvedValueOnce('retry-refresh-token');
    authRuntime.token = 'old-token';

    fetchWithTimeout
      .mockResolvedValueOnce({ status: 401, ok: false } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'new-token', refresh_token: 'new-refresh-token' }),
      } as never)
      .mockResolvedValueOnce({ status: 200, ok: true } as never);

    const response = await fetchWithAuth('http://127.0.0.1:18010', 'http://example.test', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(response.ok).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(3);
  });

  it('keeps stored tokens when the refresh endpoint fails transiently (5xx)', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken, clearStoredRefreshToken } = jest.requireMock(
      '@/services/api/auth/authSession',
    ) as {
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
      clearStoredRefreshToken: jest.Mock;
    };
    loadStoredRefreshToken.mockResolvedValueOnce('valid-refresh-token');
    authRuntime.token = 'expired-token';

    fetchWithTimeout
      .mockResolvedValueOnce({ status: 401, ok: false } as never) // original request
      .mockResolvedValueOnce({ status: 503, ok: false } as never); // refresh during deploy

    const response = await fetchWithAuth('http://127.0.0.1:18010', 'http://example.test');

    expect(response.status).toBe(401);
    expect(authRuntime.explicitlyLoggedOut).toBe(false);
    expect(clearStoredRefreshToken).not.toHaveBeenCalled();
  });

  it('keeps stored tokens when the refresh request throws (network error/timeout)', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken, clearStoredRefreshToken } = jest.requireMock(
      '@/services/api/auth/authSession',
    ) as {
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
      clearStoredRefreshToken: jest.Mock;
    };
    loadStoredRefreshToken.mockResolvedValueOnce('valid-refresh-token');
    authRuntime.token = 'expired-token';

    fetchWithTimeout
      .mockResolvedValueOnce({ status: 401, ok: false } as never) // original request
      .mockRejectedValueOnce(new Error('network down') as never); // refresh times out

    const response = await fetchWithAuth('http://127.0.0.1:18010', 'http://example.test');

    expect(response.status).toBe(401);
    expect(authRuntime.explicitlyLoggedOut).toBe(false);
    expect(clearStoredRefreshToken).not.toHaveBeenCalled();
  });

  it('clears stored tokens when the refresh is explicitly rejected (401)', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken, clearStoredRefreshToken } = jest.requireMock(
      '@/services/api/auth/authSession',
    ) as {
      loadStoredRefreshToken: jest.MockedFunction<() => Promise<string | undefined>>;
      clearStoredRefreshToken: jest.Mock;
    };
    loadStoredRefreshToken.mockResolvedValueOnce('revoked-refresh-token');
    authRuntime.token = 'expired-token';

    fetchWithTimeout
      .mockResolvedValueOnce({ status: 401, ok: false } as never) // original request
      .mockResolvedValueOnce({ status: 401, ok: false } as never); // refresh rejected

    await fetchWithAuth('http://127.0.0.1:18010', 'http://example.test');

    expect(authRuntime.explicitlyLoggedOut).toBe(true);
    expect(clearStoredRefreshToken).toHaveBeenCalled();
  });
});
