import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpResponse, http } from 'msw';
import { API_URL } from '@/config';
import { deleteAccount } from '@/services/api/auth/authentication';
import { authRuntime } from '@/services/api/auth/authRuntime';
import { server } from '@/test-utils/index';

// A stored session on either platform, so a 401 would really trigger a refresh.
jest.mock('@/services/api/auth/authSession', () => ({
  hasWebSessionFlag: jest.fn(() => true),
  setWebSessionFlag: jest.fn(),
  loadStoredAccessToken: jest.fn(async () => 'test-token'),
  loadStoredRefreshToken: jest.fn(async () => 'test-refresh-token'),
  persistStoredAccessToken: jest.fn(),
  persistStoredRefreshToken: jest.fn(),
  clearStoredAccessToken: jest.fn(),
  clearStoredRefreshToken: jest.fn(),
}));

describe('deleteAccount step-up failures', () => {
  let deleteCalls = 0;
  let refreshCalls = 0;

  beforeEach(() => {
    authRuntime.token = 'test-token';
    authRuntime.explicitlyLoggedOut = false;
    authRuntime.refreshPromise = null;
    deleteCalls = 0;
    refreshCalls = 0;
    const onRefresh = () => {
      refreshCalls += 1;
      return HttpResponse.json({ access_token: 'refreshed-token', refresh_token: 'rt-2' });
    };
    server.use(
      http.post(`${API_URL}/auth/bearer/refresh`, onRefresh),
      http.post(`${API_URL}/auth/session/refresh`, onRefresh),
    );
  });

  // Regression: a wrong password was a 401, which fetchWithAuth read as an expired
  // token: it refreshed and resent the guess, spending two rate-limit attempts.
  it('does not refresh and retry on a 403 wrong password', async () => {
    server.use(
      http.delete(`${API_URL}/users/me`, () => {
        deleteCalls += 1;
        return HttpResponse.json({ detail: 'Current password is invalid.' }, { status: 403 });
      }),
    );

    await expect(deleteAccount('wrong-password')).rejects.toThrow('Current password is invalid.');
    expect(deleteCalls).toBe(1);
    expect(refreshCalls).toBe(0);
  });

  // Control: proves the handlers above would see a refresh if one happened.
  it('still refreshes and retries on a 401 expired token', async () => {
    server.use(
      http.delete(`${API_URL}/users/me`, () => {
        deleteCalls += 1;
        return deleteCalls === 1
          ? HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
          : new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteAccount('current-password');
    expect(deleteCalls).toBe(2);
    expect(refreshCalls).toBe(1);
  });
});
