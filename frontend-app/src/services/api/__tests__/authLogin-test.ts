import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { login, logout } from '../authLogin';
import { authRuntime } from '../authRuntime';

jest.mock('../authSession', () => ({
  isWeb: jest.fn(() => false),
  setWebSessionFlag: jest.fn(),
}));

jest.mock('../request', () => ({
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
  });

  it('returns and persists native bearer token on success', async () => {
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'native-token' }),
    } as never);

    const persistAccessToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const getUser = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    const refreshAuthToken = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

    await expect(
      login('http://localhost:8000', 'user', 'pass', {
        persistAccessToken,
        getUser,
        refreshAuthToken,
      }),
    ).resolves.toBe('native-token');

    expect(persistAccessToken).toHaveBeenCalledWith('native-token');
  });

  it('on web 204 login refreshes first and then hydrates the user cache', async () => {
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { isWeb, setWebSessionFlag } = jest.requireMock('../authSession') as {
      isWeb: jest.Mock;
      setWebSessionFlag: jest.Mock;
    };

    isWeb.mockReturnValue(true);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    const persistAccessToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const getUser = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    const refreshAuthToken = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

    await expect(
      login('http://localhost:8000', 'user', 'pass', {
        persistAccessToken,
        getUser,
        refreshAuthToken,
      }),
    ).resolves.toBe('success');

    expect(setWebSessionFlag).toHaveBeenCalledWith(true);
    expect(refreshAuthToken).toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith(true);
  });

  it('on web 204 login falls back to delayed hydration when refresh fails', async () => {
    jest.useFakeTimers();
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { isWeb } = jest.requireMock('../authSession') as {
      isWeb: jest.Mock;
    };

    isWeb.mockReturnValue(true);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    const persistAccessToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const getUser = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
    const refreshAuthToken = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

    const promise = login('http://localhost:8000', 'user', 'pass', {
      persistAccessToken,
      getUser,
      refreshAuthToken,
    });

    await jest.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBe('success');
    expect(getUser).toHaveBeenCalledWith(true);

    jest.useRealTimers();
  });

  it('clears cached auth state before calling logout endpoint', async () => {
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    const clearCachedAuthState = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 200 } as never);

    await logout('http://localhost:8000', clearCachedAuthState);

    expect(clearCachedAuthState).toHaveBeenCalled();
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/logout') }),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
