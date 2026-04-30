import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchWithAuth, refreshAuthToken } from '../authRefresh';
import { authRuntime } from '../authRuntime';

jest.mock('../authSession', () => ({
  isWeb: () => false,
  hasWebSessionFlag: () => true,
  setWebSessionFlag: jest.fn(),
  loadStoredAccessToken: jest.fn(),
  persistStoredAccessToken: jest.fn(),
  clearStoredAccessToken: jest.fn(),
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
    const { persistStoredAccessToken } = jest.requireMock('../authSession') as {
      persistStoredAccessToken: jest.Mock;
    };

    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fresh-token' }),
    } as never);

    await expect(refreshAuthToken('http://localhost:8000')).resolves.toBe(true);
    expect(authRuntime.token).toBe('fresh-token');
    expect(persistStoredAccessToken).toHaveBeenCalledWith('fresh-token');
  });

  it('retries an authenticated request after a 401 and refresh', async () => {
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    authRuntime.token = 'old-token';

    fetchWithTimeout
      .mockResolvedValueOnce({ status: 401, ok: false } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'new-token' }),
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
