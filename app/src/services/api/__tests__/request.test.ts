import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createRequestId,
  DEFAULT_API_TIMEOUT_MS,
  fetchWithTimeout,
  TimeoutError,
} from '@/services/api/request';

const NO_CRYPTO_REQUEST_ID_PATTERN = /^req-[a-z0-9]+-[a-z0-9]+$/;

describe('request helpers', () => {
  it('uses crypto.randomUUID for request IDs when available', () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => 'crypto-uuid' },
    });

    expect(createRequestId()).toBe('crypto-uuid');

    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  });

  it('uses crypto.getRandomValues fallback instead of Math.random', () => {
    const originalCrypto = globalThis.crypto;
    const mathRandomSpy = jest.spyOn(Math, 'random');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: (array: Uint8Array) => {
          array.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
          return array;
        },
      },
    });

    expect(createRequestId()).toBe('req-000102030405060708090a0b0c0d0e0f');
    expect(mathRandomSpy).not.toHaveBeenCalled();

    mathRandomSpy.mockRestore();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  });

  it('keeps no-crypto fallback unique without Math.random', () => {
    const originalCrypto = globalThis.crypto;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const mathRandomSpy = jest.spyOn(Math, 'random');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    const first = createRequestId();
    const second = createRequestId();

    expect(first).toMatch(NO_CRYPTO_REQUEST_ID_PATTERN);
    expect(second).toMatch(NO_CRYPTO_REQUEST_ID_PATTERN);
    expect(first).not.toBe(second);
    expect(mathRandomSpy).not.toHaveBeenCalled();

    mathRandomSpy.mockRestore();
    dateNowSpy.mockRestore();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  });
});

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {});

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects when a request exceeds the default timeout', async () => {
    global.fetch = jest.fn((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof fetch;

    const pendingRequest = fetchWithTimeout('http://127.0.0.1:18010/products');
    const assertion = pendingRequest.catch((error) => {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).timeoutMs).toBe(DEFAULT_API_TIMEOUT_MS);
      expect((error as TimeoutError).message).toBe(
        `Request timed out after ${DEFAULT_API_TIMEOUT_MS}ms`,
      );
    });
    await jest.advanceTimersByTimeAsync(DEFAULT_API_TIMEOUT_MS);
    await assertion;
  });

  it('skips the abort timer and resolves when timeoutMs is 0', async () => {
    let resolveFn!: (r: Response) => void;
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFn = resolve;
        }),
    ) as typeof fetch;
    const pending = fetchWithTimeout('http://example.com/test', { timeoutMs: 0 });
    await jest.advanceTimersByTimeAsync(30_000);
    resolveFn(new Response('ok', { status: 200 }));
    await expect(pending).resolves.toBeTruthy();
  });

  it('propagates external signal abort to the internal controller', async () => {
    global.fetch = jest.fn((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof fetch;
    const external = new AbortController();
    const pending = fetchWithTimeout('http://example.com/test', { signal: external.signal });
    external.abort();
    await expect(pending).rejects.toThrow();
  });

  it('uses a caller-provided timeout override', async () => {
    global.fetch = jest.fn((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof fetch;

    const pendingRequest = fetchWithTimeout('http://127.0.0.1:18010/products', {
      timeoutMs: 250,
    });
    const assertion = pendingRequest.catch((error) => {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).timeoutMs).toBe(250);
      expect((error as TimeoutError).message).toBe('Request timed out after 250ms');
    });
    await jest.advanceTimersByTimeAsync(250);
    await assertion;
  });
});

describe('fetchWithTimeout header normalization', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function captureHeaders() {
    const fetchSpy = jest.fn(
      async (_url: string | URL, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response,
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    return () => new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
  }

  // Regression: headers were built with an object spread, which yields {} for a
  // Headers instance and {0:[...]} for a tuple array — silently dropping
  // Authorization and Content-Type, both legal RequestInit values.
  it('preserves a Headers instance', async () => {
    const read = captureHeaders();

    await fetchWithTimeout('http://api.test/x', {
      timeoutMs: 0,
      headers: new Headers({ Authorization: 'Bearer t', 'Content-Type': 'application/json' }),
    });

    expect(read().get('Authorization')).toBe('Bearer t');
    expect(read().get('Content-Type')).toBe('application/json');
  });

  it('preserves an array of header tuples', async () => {
    const read = captureHeaders();

    await fetchWithTimeout('http://api.test/x', {
      timeoutMs: 0,
      headers: [['Authorization', 'Bearer t']],
    });

    expect(read().get('Authorization')).toBe('Bearer t');
  });

  it('preserves a plain object and stamps a correlation id', async () => {
    const read = captureHeaders();

    await fetchWithTimeout('http://api.test/x', {
      timeoutMs: 0,
      headers: { Accept: 'application/json' },
    });

    expect(read().get('Accept')).toBe('application/json');
    expect(read().get('X-Request-ID')).toEqual(expect.any(String));
  });

  it('leaves a caller-supplied correlation id intact, case-insensitively', async () => {
    const read = captureHeaders();

    await fetchWithTimeout('http://api.test/x', {
      timeoutMs: 0,
      headers: { 'x-request-id': 'caller-owned' },
    });

    expect(read().get('X-Request-ID')).toBe('caller-owned');
  });
});
