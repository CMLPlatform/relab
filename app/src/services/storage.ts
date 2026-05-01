import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { Platform } from 'react-native';

export const isWeb = () => Platform.OS === 'web';
const getWebLocalStorage = () => globalThis.localStorage;
const getWebSessionStorage = () => globalThis.sessionStorage;

// Throw rather than fall back to localStorage: any XSS could exfiltrate it.
const SECURE_STORAGE_WEB_ERROR =
  'Secure storage is unavailable on web. Use an in-memory or session-scoped store instead.';

export async function getLocalItem(key: string): Promise<string | null> {
  if (isWeb()) {
    try {
      return getWebLocalStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return AsyncStorage.getItem(key);
}

export async function setLocalItem(key: string, value: string): Promise<void> {
  if (isWeb()) {
    try {
      getWebLocalStorage()?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeLocalItem(key: string): Promise<void> {
  if (isWeb()) {
    try {
      getWebLocalStorage()?.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await AsyncStorage.removeItem(key);
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (isWeb()) throw new Error(SECURE_STORAGE_WEB_ERROR);
  return getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isWeb()) throw new Error(SECURE_STORAGE_WEB_ERROR);
  await setItemAsync(key, value);
}

export async function removeSecureItem(key: string): Promise<void> {
  if (isWeb()) throw new Error(SECURE_STORAGE_WEB_ERROR);
  await deleteItemAsync(key);
}

export function getSessionItem(key: string): string | null {
  if (!isWeb()) return null;
  try {
    return getWebSessionStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setSessionItem(key: string, value: string): void {
  if (!isWeb()) return;
  try {
    getWebSessionStorage()?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function removeSessionItem(key: string): void {
  if (!isWeb()) return;
  try {
    getWebSessionStorage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}
