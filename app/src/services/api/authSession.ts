import { Platform } from 'react-native';
import {
  getSecureItem,
  getSessionItem,
  removeSecureItem,
  removeSessionItem,
  setSecureItem,
  setSessionItem,
} from '@/services/storage';

export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const WEB_SESSION_FLAG = 'web_has_session';

export const isWeb = () => Platform.OS === 'web';

export async function loadStoredAccessToken() {
  if (isWeb()) return;
  return getSecureItem(ACCESS_TOKEN_KEY);
}

export async function persistStoredAccessToken(nextToken: string) {
  if (isWeb()) return;
  await setSecureItem(ACCESS_TOKEN_KEY, nextToken);
}

export async function loadStoredRefreshToken() {
  if (isWeb()) return;
  return getSecureItem(REFRESH_TOKEN_KEY);
}

export async function persistStoredRefreshToken(nextToken: string) {
  if (isWeb()) return;
  await setSecureItem(REFRESH_TOKEN_KEY, nextToken);
}

export async function clearStoredAccessToken() {
  if (isWeb()) return;
  await removeSecureItem(ACCESS_TOKEN_KEY);
}

export async function clearStoredRefreshToken() {
  if (isWeb()) return;
  await removeSecureItem(REFRESH_TOKEN_KEY);
}

export function setWebSessionFlag(value: boolean) {
  if (!isWeb()) return;
  if (value) {
    setSessionItem(WEB_SESSION_FLAG, '1');
  } else {
    removeSessionItem(WEB_SESSION_FLAG);
  }
}

export function hasWebSessionFlag() {
  if (!isWeb()) return false;
  return Boolean(getSessionItem(WEB_SESSION_FLAG));
}
