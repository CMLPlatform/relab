import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authRuntime } from '../authRuntime';
import { getUser } from '../authUser';

jest.mock('../authSession', () => ({
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

    const user = await getUser('http://localhost:8000/api', fetchWithAuth, true);

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

    const firstCall = getUser('http://localhost:8000/api', fetchWithAuth, true);
    const secondCall = getUser('http://localhost:8000/api', fetchWithAuth, false);

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
});
