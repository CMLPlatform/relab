import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchWithAuth, refreshAuthToken } from '../authRefresh';
import { authRuntime } from '../authRuntime';

jest.mock('../authSession', () => ({
  isWeb: () => false,
  hasWebSessionFlag: () => true,
  setWebSessionFlag: jest.fn(),
  loadStoredAccessToken: jest.fn(),
  loadStoredRefreshToken: jest.fn(),
  persistStoredAccessToken: jest.fn(),
  persistStoredRefreshToken: jest.fn(),
  clearStoredAccessToken: jest.fn(),
  clearStoredRefreshToken: jest.fn(),
}));

jest.mock('../request', () => ({
  createRequestId: () => 'req-123',
  fetchWithTimeout: jest.fn(),
}));

describe('authRefresh', () => {
  beforeEach(() => {
    authRuntime.token = undefined;
    authRuntime.user = undefined;
    authRuntime.refreshPromise = null;
    authRuntime.getUserPromise = null;
    authRuntime.explicitlyLoggedOut = false;
    authRuntime.authGeneration = 0;
    jest.clearAllMocks();
  });

  it('stores refreshed token on native refresh success', async () => {
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken, persistStoredAccessToken, persistStoredRefreshToken } =
      jest.requireMock('../authSession') as {
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

    await expect(refreshAuthToken('http://localhost:8000')).resolves.toBe(true);
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
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    const { loadStoredRefreshToken } = jest.requireMock('../authSession') as {
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

    const response = await fetchWithAuth('http://localhost:8000', 'http://example.test', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(response.ok).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(3);
  });
});
