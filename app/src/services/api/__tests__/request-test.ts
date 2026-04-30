import { describe, expect, it, jest } from '@jest/globals';
import { createRequestId } from '../request';

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
          array.set([0, 1, 2, 3, 4, 5, 6, 7]);
          return array;
        },
      },
    });

    expect(createRequestId()).toBe('req-0001020304050607');
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
