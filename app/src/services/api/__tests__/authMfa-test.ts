import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mockPlatform, restorePlatform } from '@/test-utils/index';
import {
  claimOAuthMfaHandoff,
  clearPendingMfaLogin,
  getPendingMfaLogin,
  setPendingMfaLogin,
} from '../authMfa';

jest.mock('../request', () => ({
  fetchWithTimeout: jest.fn(),
}));

type StorageStub = {
  getItem: jest.Mock<(key: string) => string | null>;
  setItem: jest.Mock<(key: string, value: string) => void>;
  removeItem: jest.Mock<(key: string) => void>;
};

function stubSessionStorage(): StorageStub {
  const store = new Map<string, string>();
  const stub: StorageStub = {
    getItem: jest.fn((key) => store.get(key) ?? null),
    setItem: jest.fn((key, value) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key) => {
      store.delete(key);
    }),
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: stub, configurable: true });
  return stub;
}

describe('authMfa pending login storage', () => {
  beforeEach(() => {
    mockPlatform('web');
    stubSessionStorage();
    clearPendingMfaLogin();
  });

  afterEach(() => {
    clearPendingMfaLogin();
    restorePlatform();
    Object.defineProperty(globalThis, 'sessionStorage', { value: undefined, configurable: true });
  });

  it('round-trips pending MFA state through session storage', () => {
    setPendingMfaLogin({
      status: 'mfa_required',
      mfaToken: 'mfa-token',
      redirectTo: '/profile',
    });

    clearPendingMfaLogin();
    const storage = globalThis.sessionStorage as unknown as StorageStub;
    storage.setItem(
      'relab.pendingMfaLogin',
      JSON.stringify({
        status: 'mfa_required',
        mfaToken: 'stored-token',
        redirectTo: '/profile',
      }),
    );

    expect(getPendingMfaLogin()).toEqual({
      status: 'mfa_required',
      mfaToken: 'stored-token',
      redirectTo: '/profile',
    });
  });

  it('clears stale pending MFA state when stored JSON has the wrong shape', () => {
    const storage = globalThis.sessionStorage as unknown as StorageStub;
    storage.setItem('relab.pendingMfaLogin', JSON.stringify({ status: 'authenticated' }));

    expect(getPendingMfaLogin()).toBeUndefined();
    expect(storage.removeItem).toHaveBeenCalledWith('relab.pendingMfaLogin');
  });

  it('claims OAuth MFA handoff without exposing MFA tokens in callback URLs', async () => {
    const { fetchWithTimeout } = jest.requireMock('../request') as {
      fetchWithTimeout: jest.Mock;
    };
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mfa_required: true,
        mfa_token: 'claimed-mfa-token',
      }),
    } as never);

    await expect(claimOAuthMfaHandoff('handoff-token')).resolves.toEqual({
      status: 'mfa_required',
      mfaToken: 'claimed-mfa-token',
    });
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/auth/mfa/oauth/claim') }),
      expect.objectContaining({
        body: JSON.stringify({ mfa_handoff: 'handoff-token' }),
        credentials: 'include',
        method: 'POST',
      }),
    );
  });
});
