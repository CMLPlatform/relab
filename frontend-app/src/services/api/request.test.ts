import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_API_TIMEOUT_MS, fetchWithTimeout, TimeoutError, isTimeoutError } from './request';

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('rejects when a request exceeds the default timeout', async () => {
    global.fetch = jest.fn((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof fetch;

    const pendingRequest = fetchWithTimeout('http://localhost:8000/api/products');
    const assertion = pendingRequest.catch((error) => {
      expect(isTimeoutError(error)).toBe(true);
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).timeoutMs).toBe(DEFAULT_API_TIMEOUT_MS);
      expect((error as TimeoutError).message).toBe(`Request timed out after ${DEFAULT_API_TIMEOUT_MS}ms`);
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

    const pendingRequest = fetchWithTimeout('http://localhost:8000/api/products', { timeoutMs: 250 });
    const assertion = pendingRequest.catch((error) => {
      expect(isTimeoutError(error)).toBe(true);
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).timeoutMs).toBe(250);
      expect((error as TimeoutError).message).toBe('Request timed out after 250ms');
    });
    await jest.advanceTimersByTimeAsync(250);
    await assertion;
  });
});

describe('isTimeoutError', () => {
  it('returns false for non-timeout errors', () => {
    expect(isTimeoutError(new Error('foo'))).toBe(false);
    expect(isTimeoutError({ name: 'OtherError', timeoutMs: 123 })).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
    expect(isTimeoutError({})).toBe(false);
  });
});
