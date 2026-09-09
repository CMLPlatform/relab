import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  claimOAuthMfaHandoff,
  clearPendingMfaLogin,
  completeMfaChallenge,
  confirmTotpSetup,
  disableTotp,
  getPendingMfaLogin,
  parseMfaPendingPayload,
  regenerateRecoveryCodes,
  setPendingMfaLogin,
  startTotpSetup,
} from '@/services/api/auth/authMfa';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

jest.mock('@/services/api/request', () => ({
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

  it('round-trips pending MFA state in memory and clears it', () => {
    setPendingMfaLogin({
      status: 'mfa_required',
      mfaToken: 'mfa-token',
      redirectTo: '/account',
    });

    expect(getPendingMfaLogin()).toEqual({
      status: 'mfa_required',
      mfaToken: 'mfa-token',
      redirectTo: '/account',
    });

    clearPendingMfaLogin();
    expect(getPendingMfaLogin()).toBeUndefined();
  });

  // The MFA token is a credential: web storage is XSS-readable, so it must never
  // be mirrored there — a reload drops the challenge instead.
  it('never writes the pending MFA token to web session storage', () => {
    const storage = globalThis.sessionStorage as unknown as StorageStub;

    setPendingMfaLogin({ status: 'mfa_required', mfaToken: 'mfa-token' });

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem('relab.pendingMfaLogin')).toBeNull();
  });

  it('claims OAuth MFA handoff without exposing MFA tokens in callback URLs', async () => {
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
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

describe('completeMfaChallenge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    restorePlatform();
  });

  // Regression: a bodyless 204 was treated as a web session on every platform,
  // so native completed the challenge holding no bearer token.
  it('rejects a 204 on native, where no bearer token was issued', async () => {
    mockPlatform('ios');
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await expect(completeMfaChallenge('mfa-token', '123456')).rejects.toThrow(
      'Invalid MFA login response.',
    );
  });

  it('accepts a 204 on web, where the session lives in cookies', async () => {
    mockPlatform('web');
    stubSessionStorage();
    const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
      fetchWithTimeout: jest.Mock;
    };
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await expect(completeMfaChallenge('mfa-token', '123456')).resolves.toBeUndefined();
  });
});

describe('parseMfaPendingPayload redirect guard', () => {
  // `redirectTo` is echoed back from the server and fed to the router after
  // sign-in, so anything that could leave the app must be dropped.
  it.each(['//evil.example.com/phish', 'https://evil.example.com/phish', 'account', '', 42, null])(
    'drops the unsafe redirect %p',
    (redirectTo) => {
      expect(
        parseMfaPendingPayload({ status: 'mfa_required', mfaToken: 'token', redirectTo }),
      ).toEqual({ status: 'mfa_required', mfaToken: 'token', redirectTo: undefined });
    },
  );

  it('keeps a same-origin relative path', () => {
    expect(
      parseMfaPendingPayload({
        status: 'mfa_required',
        mfaToken: 'token',
        redirectTo: '/products/12?tab=files',
      }),
    ).toEqual({
      status: 'mfa_required',
      mfaToken: 'token',
      redirectTo: '/products/12?tab=files',
    });
  });

  it('rejects payloads that are not an MFA challenge', () => {
    expect(parseMfaPendingPayload(null)).toBeUndefined();
    expect(parseMfaPendingPayload('mfa_required')).toBeUndefined();
    expect(parseMfaPendingPayload({ mfa_required: true })).toBeUndefined();
    expect(parseMfaPendingPayload({ status: 'mfa_required' })).toBeUndefined();
  });
});

describe('TOTP enrolment', () => {
  const { fetchWithTimeout } = jest.requireMock('@/services/api/request') as {
    fetchWithTimeout: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function lastRequest() {
    const [url, init] = fetchWithTimeout.mock.calls.at(-1) as [URL, RequestInit];
    return { path: url.pathname, body: init.body as string, method: init.method };
  }

  it('starts setup and maps the snake_case enrolment payload', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        setup_token: 'setup-token',
        secret: 'BASE32SECRET',
        otpauth_uri: 'otpauth://totp/Relab:me',
      }),
    } as never);

    await expect(startTotpSetup()).resolves.toEqual({
      setupToken: 'setup-token',
      secret: 'BASE32SECRET',
      otpauthUri: 'otpauth://totp/Relab:me',
    });
    expect(lastRequest().path).toBe('/v1/auth/mfa/totp/setup');
  });

  it('rejects a setup response missing any of the three fields', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ setup_token: 'setup-token', secret: 'BASE32SECRET' }),
    } as never);

    await expect(startTotpSetup()).rejects.toThrow('Invalid MFA setup response.');
  });

  it('surfaces the server detail when setup is refused', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Password confirmation required.' }),
    } as never);

    await expect(startTotpSetup()).rejects.toThrow('Password confirmation required.');
  });

  it('confirms setup with the token, code and password, returning recovery codes', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recovery_codes: ['aaaa-bbbb', 'cccc-dddd'] }),
    } as never);

    await expect(confirmTotpSetup('setup-token', '123456', 'hunter2')).resolves.toEqual([
      'aaaa-bbbb',
      'cccc-dddd',
    ]);
    const { path, body } = lastRequest();
    expect(path).toBe('/v1/auth/mfa/totp/confirm');
    expect(JSON.parse(body)).toEqual({
      setup_token: 'setup-token',
      code: '123456',
      password: 'hunter2',
    });
  });

  it.each([{ recovery_codes: 'aaaa-bbbb' }, { recovery_codes: [1, 2] }, {}])(
    'rejects the malformed recovery-code payload %p',
    async (payload) => {
      fetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => payload } as never);

      await expect(confirmTotpSetup('setup-token', '123456', 'hunter2')).rejects.toThrow(
        'Invalid recovery codes response.',
      );
    },
  );

  it('regenerates recovery codes behind a fresh TOTP code', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recovery_codes: ['eeee-ffff'] }),
    } as never);

    await expect(regenerateRecoveryCodes('654321')).resolves.toEqual(['eeee-ffff']);
    const { path, body } = lastRequest();
    expect(path).toBe('/v1/auth/mfa/recovery-codes/regenerate');
    expect(JSON.parse(body)).toEqual({ code: '654321' });
  });

  it('disables TOTP behind a fresh code', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: true, status: 204 } as never);

    await expect(disableTotp('654321')).resolves.toBeUndefined();
    const { path, body, method } = lastRequest();
    expect(method).toBe('POST');
    expect(path).toBe('/v1/auth/mfa/totp/disable');
    expect(JSON.parse(body)).toEqual({ code: '654321' });
  });

  it('does not swallow a rejected disable', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Invalid code.' }),
    } as never);

    await expect(disableTotp('000000')).rejects.toThrow('Invalid code.');
  });
});
