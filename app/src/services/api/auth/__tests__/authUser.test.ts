import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authRuntime } from '@/services/api/auth/authRuntime';
import { getUser } from '@/services/api/auth/authUser';

jest.mock('@/services/api/auth/authRefresh', () => ({ fetchWithAuth: jest.fn() }));

jest.mock('@/services/api/auth/authSession', () => ({
  hasWebSessionFlag: () => true,
  setWebSessionFlag: jest.fn(),
}));

const { fetchWithAuth } = jest.requireMock('@/services/api/auth/authRefresh') as {
  fetchWithAuth: jest.Mock;
};

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
    fetchWithAuth.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        // clearCachedAuthState() bumps the generation and drops the user.
        authRuntime.authGeneration++;
        authRuntime.user = undefined;
        return RAW_USER;
      },
    } as never);

    await expect(getUser(true)).resolves.toBeUndefined();
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
    fetchWithAuth.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => RAW_USER,
    } as never);

    await expect(getUser(true)).resolves.toMatchObject({
      email: 'dev@example.com',
    });
    expect(authRuntime.explicitlyLoggedOut).toBe(false);
  });

  it('hydrates and caches a mapped user', async () => {
    fetchWithAuth.mockResolvedValue({
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
    } as never);

    const user = await getUser(true);

    expect(user?.username).toBe('dev');
    expect(authRuntime.user?.username).toBe('dev');
  });

  it('reuses the in-flight user promise for non-forced concurrent callers', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchWithAuth.mockReturnValue(pendingResponse);

    const firstCall = getUser(true);
    const secondCall = getUser(false);

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
    fetchWithAuth.mockResolvedValue({
      ok: false,
      status: 502,
    } as never);

    const user = await getUser(true);

    expect(user).toBeUndefined();
    expect(setWebSessionFlag).not.toHaveBeenCalled();
  });

  it('clears the web session flag when /users/me rejects with 401', async () => {
    const { setWebSessionFlag } = jest.requireMock('@/services/api/auth/authSession') as {
      setWebSessionFlag: jest.Mock;
    };
    fetchWithAuth.mockResolvedValue({
      ok: false,
      status: 401,
    } as never);

    const user = await getUser(true);

    expect(user).toBeUndefined();
    expect(setWebSessionFlag).toHaveBeenCalledWith(false);
  });
});
