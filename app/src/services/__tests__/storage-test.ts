import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { mockPlatform, restorePlatform } from '@/test-utils/index';
import {
  getLocalItem,
  getSecureItem,
  getSessionItem,
  removeLocalItem,
  removeSecureItem,
  removeSessionItem,
  setLocalItem,
  setSecureItem,
  setSessionItem,
} from '../storage';

const SECURE_STORAGE_UNAVAILABLE = /Secure storage is unavailable/;

type StorageStub = {
  getItem: jest.Mock<(k: string) => string | null>;
  setItem: jest.Mock<(k: string, v: string) => void>;
  removeItem: jest.Mock<(k: string) => void>;
};

function stubWebStorage(key: 'localStorage' | 'sessionStorage'): StorageStub {
  const store = new Map<string, string>();
  const stub: StorageStub = {
    getItem: jest.fn<(k: string) => string | null>((k) => store.get(k) ?? null),
    setItem: jest.fn<(k: string, v: string) => void>((k, v) => {
      store.set(k, v);
    }),
    removeItem: jest.fn<(k: string) => void>((k) => {
      store.delete(k);
    }),
  };
  Object.defineProperty(globalThis, key, { value: stub, configurable: true });
  return stub;
}

function removeWebStorage(key: 'localStorage' | 'sessionStorage') {
  Object.defineProperty(globalThis, key, { value: undefined, configurable: true });
}

describe('services/storage', () => {
  const secureGet = getItemAsync as jest.MockedFunction<typeof getItemAsync>;
  const secureSet = setItemAsync as jest.MockedFunction<typeof setItemAsync>;
  const secureDelete = deleteItemAsync as jest.MockedFunction<typeof deleteItemAsync>;

  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  afterEach(() => {
    restorePlatform();
    removeWebStorage('localStorage');
    removeWebStorage('sessionStorage');
  });

  describe('web platform', () => {
    beforeEach(() => {
      mockPlatform('web');
    });

    it('local: round-trips through localStorage', async () => {
      const storage = stubWebStorage('localStorage');
      await setLocalItem('k', 'v');
      await expect(getLocalItem('k')).resolves.toBe('v');
      await removeLocalItem('k');
      await expect(getLocalItem('k')).resolves.toBeNull();
      expect(storage.setItem).toHaveBeenCalledWith('k', 'v');
      expect(storage.removeItem).toHaveBeenCalledWith('k');
    });

    it('local: returns null and swallows when localStorage access throws', async () => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new Error('blocked');
        },
      });

      await expect(getLocalItem('k')).resolves.toBeNull();
      await expect(setLocalItem('k', 'v')).resolves.toBeUndefined();
      await expect(removeLocalItem('k')).resolves.toBeUndefined();
    });

    it('secure: throws on web instead of falling back to localStorage', async () => {
      await expect(setSecureItem('token', 'abc')).rejects.toThrow(SECURE_STORAGE_UNAVAILABLE);
      await expect(getSecureItem('token')).rejects.toThrow(SECURE_STORAGE_UNAVAILABLE);
      await expect(removeSecureItem('token')).rejects.toThrow(SECURE_STORAGE_UNAVAILABLE);
      expect(secureSet).not.toHaveBeenCalled();
      expect(secureGet).not.toHaveBeenCalled();
      expect(secureDelete).not.toHaveBeenCalled();
    });

    it('session: round-trips through sessionStorage', () => {
      const storage = stubWebStorage('sessionStorage');
      setSessionItem('s', '1');
      expect(getSessionItem('s')).toBe('1');
      removeSessionItem('s');
      expect(getSessionItem('s')).toBeNull();
      expect(storage.setItem).toHaveBeenCalledWith('s', '1');
    });

    it('session: swallows errors when sessionStorage is inaccessible', () => {
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        get: () => {
          throw new Error('blocked');
        },
      });

      expect(getSessionItem('s')).toBeNull();
      expect(() => setSessionItem('s', '1')).not.toThrow();
      expect(() => removeSessionItem('s')).not.toThrow();
    });
  });

  describe('native platform', () => {
    beforeEach(() => {
      mockPlatform('ios');
    });

    it('local: delegates to AsyncStorage', async () => {
      await setLocalItem('k', 'v');
      await expect(getLocalItem('k')).resolves.toBe('v');
      await removeLocalItem('k');
      await expect(getLocalItem('k')).resolves.toBeNull();
    });

    it('secure: delegates to expo-secure-store', async () => {
      secureGet.mockResolvedValueOnce('token-value');

      await setSecureItem('token', 'token-value');
      await expect(getSecureItem('token')).resolves.toBe('token-value');
      await removeSecureItem('token');

      expect(secureSet).toHaveBeenCalledWith('token', 'token-value');
      expect(secureGet).toHaveBeenCalledWith('token');
      expect(secureDelete).toHaveBeenCalledWith('token');
    });

    it('session: is a no-op outside web', () => {
      expect(getSessionItem('s')).toBeNull();
      setSessionItem('s', '1');
      removeSessionItem('s');
      expect(getSessionItem('s')).toBeNull();
    });
  });
});
