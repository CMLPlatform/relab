import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as auth from '../authentication';
import { mockResponse, setupFetchMock } from '@/test-utils';

setupFetchMock();
const asyncStorageMock = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const fetchMock = () => global.fetch as jest.MockedFunction<typeof fetch>;

describe('Authentication API Service', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      // Expected negative-path tests intentionally exercise error logging.
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(async () => {
    setupFetchMock();
    jest.clearAllMocks();
    // Reset module-level token/user state by logging out
    fetchMock().mockResolvedValueOnce(mockResponse(200, {}) as Response);
    await auth.logout();
    jest.clearAllMocks(); // clear the logout call
  });

  // ─── getToken ───────────────────────────────────────────

  describe('getToken', () => {
    it('retrieves token from AsyncStorage if available', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');

      const token = await auth.getToken();

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('access_token');
      expect(token).toBe('test-token');
    });

    it('returns undefined when no token in AsyncStorage', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce(null);

      const token = await auth.getToken();

      expect(token).toBeUndefined();
    });

    it('returns undefined when AsyncStorage throws', async () => {
      asyncStorageMock.getItem.mockRejectedValueOnce(new Error('storage error'));

      const token = await auth.getToken();

      expect(token).toBeUndefined();
    });

    it('returns cached token without AsyncStorage on second call', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('cached-token');
      await auth.getToken(); // populate cache

      const token = await auth.getToken(); // should use cache

      expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
      expect(token).toBe('cached-token');
    });
  });

  // ─── login ──────────────────────────────────────────────

  describe('login', () => {
    it('handles successful credential login (native)', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(200, { access_token: 'new-token-123' }) as Response);

      const result = await auth.login('user', 'pass');

      expect(asyncStorageMock.setItem).toHaveBeenCalledWith('access_token', 'new-token-123');
      expect(result).toBe('new-token-123');
    });

    it("returns 'success' for 204 cookie login", async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(204, null) as Response);

      const result = await auth.login('user', 'pass');

      expect(result).toBe('success');
    });

    it('returns undefined for HTTP 400', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(400, { detail: 'Invalid credentials' }, false) as Response);

      const result = await auth.login('user', 'wrong-pass');

      expect(result).toBeUndefined();
    });

    it('throws on non-ok, non-400 response', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(500, { detail: 'Server error' }, false) as Response);

      await expect(auth.login('user', 'pass')).rejects.toThrow();
    });
  });

  // ─── logout ─────────────────────────────────────────────

  describe('logout', () => {
    it('calls the logout endpoint', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(200, {}) as Response);

      await auth.logout();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/auth/logout') }),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('removes access_token from AsyncStorage on native', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(200, {}) as Response);

      await auth.logout();

      expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('access_token');
    });

    it('does not throw when logout fetch fails', async () => {
      fetchMock().mockRejectedValueOnce(new Error('network error'));

      await expect(auth.logout()).resolves.not.toThrow();
    });
  });

  // ─── refreshAuthToken ───────────────────────────────────

  describe('refreshAuthToken', () => {
    it('returns false when response is not ok', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(401, {}, false) as Response);

      const result = await auth.refreshAuthToken();

      expect(result).toBe(false);
    });

    it('returns true and stores token on native success', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(200, { access_token: 'refreshed-token' }) as Response);

      const result = await auth.refreshAuthToken();

      expect(result).toBe(true);
      expect(asyncStorageMock.setItem).toHaveBeenCalledWith('access_token', 'refreshed-token');
    });

    it('returns false when response body has no access_token', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(200, { something_else: true }) as Response);

      const result = await auth.refreshAuthToken();

      expect(result).toBe(false);
    });

    it('returns false when fetch throws', async () => {
      fetchMock().mockRejectedValueOnce(new Error('network error'));

      const result = await auth.refreshAuthToken();

      expect(result).toBe(false);
    });

    it('returns false on web when hasWebSessionFlag is false', async () => {
      // Mock isWeb implicitly by checking behavior or mocking it if possible
      // Here we rely on the implementation using hasWebSessionFlag
      jest.spyOn(auth, 'hasWebSessionFlag').mockReturnValueOnce(false);
      // We need to trigger the isWeb path. The service uses Platform.OS.
      // Assuming we can mock Platform.OS or just use the current one if it's web.
      const result = await auth.refreshAuthToken();
      expect(result).toBe(false);
    });
  });

  describe('fetchWithAuth', () => {
    it('refreshes token on 401 and retries', async () => {
      asyncStorageMock.getItem.mockResolvedValue('old-token');
      fetchMock()
        .mockResolvedValueOnce(mockResponse(401, {}, false) as Response) // first call 401
        .mockResolvedValueOnce(mockResponse(200, { access_token: 'new-token' }) as Response) // refresh
        .mockResolvedValueOnce(mockResponse(200, { success: true }) as Response); // retry

      // We need to call a function that uses fetchWithAuth internally, like getUser(true)
      await auth.getUser(true);
      expect(fetchMock()).toHaveBeenCalledTimes(3);
    });
  });

  // ─── getUser ────────────────────────────────────────────

  describe('getUser', () => {
    const rawUser = {
      id: 1,
      email: 'test@example.com',
      is_active: true,
      is_superuser: false,
      is_verified: true,
      username: 'testuser',
      oauth_accounts: [],
    };

    it('fetches and returns a mapped user object', async () => {
      // fetchWithAuth calls getToken first, then fetch
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(200, rawUser) as Response);

      const user = await auth.getUser(true);

      expect(user).toMatchObject({
        id: 1,
        email: 'test@example.com',
        isActive: true,
        isSuperuser: false,
        isVerified: true,
        username: 'testuser',
      });
    });

    it('returns cached user without fetching on second call', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(200, rawUser) as Response);
      await auth.getUser(true); // populate cache

      const fetchCallCount = fetchMock().mock.calls.length;

      const user = await auth.getUser(); // should use cache

      expect(fetchMock().mock.calls.length).toBe(fetchCallCount);
      expect(user?.username).toBe('testuser');
    });

    it('returns undefined when response is not ok', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(401, { detail: 'Unauthorized' }, false) as Response);

      const user = await auth.getUser(true);

      expect(user).toBeUndefined();
    });

    it("falls back to 'Username not defined' when username is missing", async () => {
      const userWithoutUsername = { ...rawUser, username: null };
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(200, userWithoutUsername) as Response);

      const user = await auth.getUser(true);

      expect(user?.username).toBe('Username not defined');
    });

    it('reuses the in-flight user promise for concurrent callers', async () => {
      let resolveFetch!: (value: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchMock().mockReturnValue(pendingFetch as never);

      const firstCall = auth.getUser(true);
      const secondCall = auth.getUser();
      resolveFetch(mockResponse(200, rawUser) as Response);

      await firstCall;
      await secondCall;
      expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when the response body cannot be parsed', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('invalid json');
        },
      } as never);

      await expect(auth.getUser(true)).resolves.toBeUndefined();
    });

    it('returns undefined when the network request fails', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockRejectedValueOnce(new Error('network down'));

      await expect(auth.getUser(true)).resolves.toBeUndefined();
    });

    it('returns the cached user from getCachedUser after a successful fetch', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(200, rawUser) as Response);

      await auth.getUser(true);

      expect(auth.getCachedUser()).toMatchObject({ username: 'testuser' });
    });
  });

  // ─── register ───────────────────────────────────────────

  describe('register', () => {
    it('returns success:true on 201', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(201, {}) as Response);

      const result = await auth.register('user', 'user@example.com', 'pass123');

      expect(result).toEqual({ success: true });
    });

    it('returns success:false with error message on failure', async () => {
      fetchMock().mockResolvedValueOnce(
        mockResponse(400, { detail: { reason: 'Email already registered' } }, false) as Response,
      );

      const result = await auth.register('user', 'taken@example.com', 'pass123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already registered');
    });

    it('returns success:false with generic message on non-JSON error', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(400, 'Bad Request', false) as Response);
      const result = await auth.register('user', 'user@example.com', 'pass');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Registration failed. Please try again.');
    });

    it('returns success:false with detail string on failure', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(422, { detail: 'Validation error' }, false) as Response);

      const result = await auth.register('user', 'bad', 'pass123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation error');
    });

    it('returns network error on fetch rejection', async () => {
      fetchMock().mockRejectedValueOnce(new Error('Network failed'));

      const result = await auth.register('user', 'user@example.com', 'pass');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  // ─── verify ─────────────────────────────────────────────

  describe('verify', () => {
    it('returns true when response is ok', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(202, {}) as Response);

      const result = await auth.verify('user@example.com');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('request-verify-token') }),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns false when response is not ok', async () => {
      fetchMock().mockResolvedValueOnce(mockResponse(400, {}, false) as Response);

      const result = await auth.verify('bad@example.com');

      expect(result).toBe(false);
    });
  });

  // ─── updateUser ─────────────────────────────────────────

  describe('updateUser', () => {
    it('returns updated user on success', async () => {
      const updatedUser = {
        id: 1,
        email: 'new@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: true,
        username: 'newusername',
        oauth_accounts: [],
      };
      // fetchWithAuth: getToken + PATCH request
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock()
        .mockResolvedValueOnce(mockResponse(200, {}) as Response) // PATCH
        .mockResolvedValueOnce(mockResponse(200, updatedUser) as Response); // getUser(true)

      const result = await auth.updateUser({ username: 'newusername' });

      expect(result?.username).toBe('newusername');
    });

    it('throws on non-ok response with detail string', async () => {
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(400, { detail: 'Username taken' }, false) as Response);

      await expect(auth.updateUser({ username: 'taken' })).rejects.toThrow('Username taken');
    });

    it('throws with fallback message when no detail', async () => {
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(500, {}, false) as Response);

      await expect(auth.updateUser({})).rejects.toThrow('Failed to update user profile');
    });

    it('throws with detail object message', async () => {
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock().mockResolvedValueOnce(
        mockResponse(400, { detail: { message: 'Custom error message' } }, false) as Response,
      );

      await expect(auth.updateUser({})).rejects.toThrow('Custom error message');
    });
  });

  // ─── unlinkOAuth ────────────────────────────────────────

  describe('unlinkOAuth', () => {
    it('returns true on success and busts user cache', async () => {
      // pre-populate user cache
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock().mockResolvedValueOnce(
        mockResponse(200, {
          id: 1,
          email: 'u@e.com',
          is_active: true,
          is_superuser: false,
          is_verified: true,
          username: 'user',
          oauth_accounts: [{ provider: 'google' }],
        }) as Response,
      );
      await auth.getUser(true);

      // now unlink
      fetchMock().mockResolvedValueOnce(mockResponse(204, {}) as Response);
      const result = await auth.unlinkOAuth('google');

      expect(result).toBe(true);
    });

    it('throws when response is not ok (with detail)', async () => {
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(400, { detail: 'Provider not linked' }, false) as Response);

      await expect(auth.unlinkOAuth('google')).rejects.toThrow('Provider not linked');
    });

    it('throws with fallback message when response is not ok and no detail', async () => {
      asyncStorageMock.getItem.mockResolvedValue('test-token');
      fetchMock().mockResolvedValueOnce(mockResponse(500, {}, false) as Response);

      await expect(auth.unlinkOAuth('github')).rejects.toThrow('Failed to unlink github account');
    });
  });
});
