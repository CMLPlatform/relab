import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authRuntime } from '@/services/api/auth/authRuntime';
import { getUser } from '@/services/api/auth/authUser';

jest.mock('@/services/api/auth/authSession', () => ({
  isWeb: () => false,
  hasWebSessionFlag: () => true,
  setWebSessionFlag: jest.fn(),
}));

describe('authUser', () => {
  beforeEach(() => {
    authRuntime.token = undefined;
    authRuntime.user = undefined;
    authRuntime.refreshPromise = null;
    authRuntime.getUserPromise = null;
    authRuntime.explicitlyLoggedOut = false;
    authRuntime.authGeneration = 0;
    jest.clearAllMocks();
  });

  const RAW_USER = {
    id: 1,
    email: 'dev@example.com',
    is_active: true,
    is_superuser: false,
    is_verified: true,
    username: 'dev',
    oauth_accounts: [],
  };

  // Regression: getUser re-checked authGeneration before the parse but not
  // after, so a logout landing mid-body resurrected the signed-out user.
  it('does not resurrect the user when a logout lands while the body is parsing', async () => {
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        // clearCachedAuthState() bumps the generation and drops the user.
        authRuntime.authGeneration++;
        authRuntime.user = undefined;
        return RAW_USER;
      },
    } as never);

    await expect(getUser('http://api.test', fetchWithAuth as never, true)).resolves.toBeUndefined();
    expect(authRuntime.user).toBeUndefined();
    const { setWebSessionFlag } = jest.requireMock('@/services/api/auth/authSession') as {
      setWebSessionFlag: jest.Mock;
    };
    expect(setWebSessionFlag).not.toHaveBeenCalledWith(true);
  });

  // Regression: a successful authenticated fetch proves a live session, so it
  // must re-arm the transparent 401 refresh that a failed refresh disabled.
  it('clears explicitlyLoggedOut when an authenticated fetch succeeds', async () => {
    authRuntime.explicitlyLoggedOut = true;
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => RAW_USER,
    } as never);

    await expect(getUser('http://api.test', fetchWithAuth as never, true)).resolves.toMatchObject({
      email: 'dev@example.com',
    });
    expect(authRuntime.explicitlyLoggedOut).toBe(false);
  });

  it('hydrates and caches a mapped user', async () => {
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 1,
        email: 'dev@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: true,
        username: 'dev',
        oauth_accounts: [],
        preferences: {},
      }),
    } as never) as jest.MockedFunction<
      (apiUrl: string, url: string | URL, options?: RequestInit) => Promise<Response>
    >;

    const user = await getUser('http://127.0.0.1:18010', fetchWithAuth, true);

    expect(user?.username).toBe('dev');
    expect(authRuntime.user?.username).toBe('dev');
  });

  it('reuses the in-flight user promise for non-forced concurrent callers', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchWithAuth = jest.fn().mockReturnValue(pendingResponse) as jest.MockedFunction<
      (apiUrl: string, url: string | URL, options?: RequestInit) => Promise<Response>
    >;

    const firstCall = getUser('http://127.0.0.1:18010', fetchWithAuth, true);
    const secondCall = getUser('http://127.0.0.1:18010', fetchWithAuth, false);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        id: 1,
        email: 'dev@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: true,
        username: 'dev',
        oauth_accounts: [],
        preferences: {},
      }),
    } as Response);

    await firstCall;
    await secondCall;

    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('keeps the web session flag on a transient 5xx from /users/me', async () => {
    const { setWebSessionFlag } = jest.requireMock('@/services/api/auth/authSession') as {
      setWebSessionFlag: jest.Mock;
    };
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
    } as never) as jest.MockedFunction<
      (apiUrl: string, url: string | URL, options?: RequestInit) => Promise<Response>
    >;

    const user = await getUser('http://127.0.0.1:18010', fetchWithAuth, true);

    expect(user).toBeUndefined();
    expect(setWebSessionFlag).not.toHaveBeenCalled();
  });

  it('clears the web session flag when /users/me rejects with 401', async () => {
    const { setWebSessionFlag } = jest.requireMock('@/services/api/auth/authSession') as {
      setWebSessionFlag: jest.Mock;
    };
    const fetchWithAuth = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as never) as jest.MockedFunction<
      (apiUrl: string, url: string | URL, options?: RequestInit) => Promise<Response>
    >;

    const user = await getUser('http://127.0.0.1:18010', fetchWithAuth, true);

    expect(user).toBeUndefined();
    expect(setWebSessionFlag).toHaveBeenCalledWith(false);
  });
});
