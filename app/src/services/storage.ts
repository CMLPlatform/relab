import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { Platform } from 'react-native';

// Single source of truth for the query-cache persister's storage key
// (_layout.tsx) and for the persisted client stores below.
export const QUERY_CACHE_STORAGE_KEY = 'relab-query-cache';
export const RECENT_CATEGORIES_STORAGE_KEY = 'relab-recent-categories';

// Everything sign-out wipes. A shared device's next user must not inherit the
// previous one's data, so a new persisted store adds its key here and
// registers its in-memory reset below. The policy lives in services/ rather
// than in AuthProvider so context/ doesn't have to import from features/.
const SIGN_OUT_STORAGE_KEYS = [QUERY_CACHE_STORAGE_KEY, RECENT_CATEGORIES_STORAGE_KEY];

// Removing the AsyncStorage key alone is not enough: a zustand store keeps its
// state in memory and would re-persist the previous user's picks on the next
// write. Owners register a reset that empties the live state too.
const signOutResets = new Set<() => void>();

export function registerSignOutReset(reset: () => void): void {
  signOutResets.add(reset);
}

export async function clearPersistedUserData(): Promise<void> {
  for (const reset of signOutResets) reset();
  await AsyncStorage.multiRemove(SIGN_OUT_STORAGE_KEYS);
}

export const isWeb = () => Platform.OS === 'web';
const getWebLocalStorage = () => globalThis.localStorage;
const getWebSessionStorage = () => globalThis.sessionStorage;
// Key-name lint only: this catches a caller *naming* a slot like a credential,
// not a token smuggled under an innocuous key — the guard cannot see values.
// The real protection is that all tokens route through setSecureItem (below),
// which throws on web rather than ever touching localStorage.
//
// Keys are normalized to snake_case first: an `i` flag would make `[^a-z0-9]`
// exclude A-Z too, so `authToken` would never hit a word boundary and slip past.
const SENSITIVE_LOCAL_STORAGE_KEY_PATTERN =
  /(^|_)(access_?token|refresh_?token|api_?key|token|secret|password|authorization|auth|session|jwt|bearer|credential|cookie)s?(_|$)/;

function normalizeStorageKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

// Throw rather than fall back to localStorage: any XSS could exfiltrate it.
const SECURE_STORAGE_WEB_ERROR =
  'Secure storage is unavailable on web. Use an in-memory or session-scoped store instead.';
const SENSITIVE_LOCAL_STORAGE_ERROR = 'Sensitive values must not be stored in local storage.';

function assertLocalStorageKeyIsSafe(key: string): void {
  if (SENSITIVE_LOCAL_STORAGE_KEY_PATTERN.test(normalizeStorageKey(key))) {
    throw new Error(SENSITIVE_LOCAL_STORAGE_ERROR);
  }
}

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
  assertLocalStorageKeyIsSafe(key);
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
