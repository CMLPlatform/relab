import { logError } from '@/utils/logging';
import { getAuthRefreshPath } from './authHelpers';
import { authRuntime } from './authRuntime';
import {
  clearStoredAccessToken,
  hasWebSessionFlag,
  isWeb,
  loadStoredAccessToken,
  persistStoredAccessToken,
  setWebSessionFlag,
} from './authSession';
import { createRequestId, fetchWithTimeout } from './request';

export async function persistAccessToken(nextToken: string): Promise<void> {
  authRuntime.token = nextToken;
  authRuntime.explicitlyLoggedOut = false;
  await persistStoredAccessToken(nextToken);
}

export async function clearCachedAuthState(): Promise<void> {
  authRuntime.token = undefined;
  authRuntime.user = undefined;
  authRuntime.getUserPromise = null;
  authRuntime.authGeneration++;
  authRuntime.explicitlyLoggedOut = true;
  await clearStoredAccessToken();
  setWebSessionFlag(false);
}

export async function getToken(): Promise<string | undefined> {
  if (authRuntime.token) return authRuntime.token;
  if (isWeb()) return;

  try {
    const storedToken = await loadStoredAccessToken();
    if (storedToken) {
      authRuntime.token = storedToken;
      return storedToken;
    }
  } catch (err) {
    logError('[GetToken Error]:', err);
  }
  return;
}

export async function refreshAuthToken(apiUrl: string): Promise<boolean> {
  if (authRuntime.refreshPromise) return authRuntime.refreshPromise;
  if (isWeb() && !hasWebSessionFlag()) return false;

  const authPath = getAuthRefreshPath(isWeb());
  const url = new URL(apiUrl + authPath);

  authRuntime.refreshPromise = (async () => {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        setWebSessionFlag(false);
        authRuntime.explicitlyLoggedOut = true;
        return false;
      }

      if (isWeb()) {
        setWebSessionFlag(true);
        authRuntime.explicitlyLoggedOut = false;
        return true;
      }

      const data = await response.json().catch(() => null);
      if (typeof data?.access_token === 'string') {
        await persistAccessToken(data.access_token);
        return true;
      }

      return false;
    } catch (err) {
      logError('[Refresh Token Error]:', err);
      return false;
    } finally {
      authRuntime.refreshPromise = null;
    }
  })();

  return authRuntime.refreshPromise;
}

export async function fetchWithAuth(
  apiUrl: string,
  url: URL | string,
  options: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  headers['X-Request-ID'] ||= createRequestId();

  const authToken = await getToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const makeRequest = () =>
    fetchWithTimeout(url, {
      ...options,
      headers,
      credentials: 'include',
    });

  let response = await makeRequest();

  if (response.status === 401 && !authRuntime.explicitlyLoggedOut) {
    const refreshed = await refreshAuthToken(apiUrl);
    if (refreshed) {
      const newToken = await getToken();
      if (newToken) headers.Authorization = `Bearer ${newToken}`;
      response = await makeRequest();
    } else {
      await clearCachedAuthState();
    }
  }

  return response;
}
