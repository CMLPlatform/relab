import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = () => Platform.OS === 'web';
const getWebLocalStorage = () => globalThis.localStorage;
const getWebSessionStorage = () => globalThis.sessionStorage;

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
  if (isWeb()) {
    return AsyncStorage.getItem(key);
  }
  return getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isWeb()) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await setItemAsync(key, value);
}

export async function removeSecureItem(key: string): Promise<void> {
  if (isWeb()) {
    await AsyncStorage.removeItem(key);
    return;
  }
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
