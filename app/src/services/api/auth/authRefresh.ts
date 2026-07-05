import { createRequestId, fetchWithTimeout, type TimedRequestInit } from '@/services/api/request';
import { logError } from '@/utils/logging';
import { getAuthRefreshPath } from './authHelpers';
import { authRuntime } from './authRuntime';
import {
  clearStoredAccessToken,
  clearStoredRefreshToken,
  hasWebSessionFlag,
  isWeb,
  loadStoredAccessToken,
  loadStoredRefreshToken,
  persistStoredAccessToken,
  persistStoredRefreshToken,
  setWebSessionFlag,
} from './authSession';

export async function persistAccessToken(nextToken: string): Promise<void> {
  authRuntime.token = nextToken;
  authRuntime.explicitlyLoggedOut = false;
  await persistStoredAccessToken(nextToken);
}

export async function persistRefreshToken(nextToken: string): Promise<void> {
  authRuntime.explicitlyLoggedOut = false;
  await persistStoredRefreshToken(nextToken);
}

export async function clearCachedAuthState(): Promise<void> {
  authRuntime.token = undefined;
  authRuntime.user = undefined;
  authRuntime.getUserPromise = null;
  authRuntime.authGeneration++;
  authRuntime.explicitlyLoggedOut = true;
  await Promise.all([clearStoredAccessToken(), clearStoredRefreshToken()]);
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
  const web = isWeb();
  if (web && !hasWebSessionFlag()) return false;

  const authPath = getAuthRefreshPath(web);
  const url = new URL(apiUrl + authPath);

  authRuntime.refreshPromise = (async () => {
    const capturedGeneration = authRuntime.authGeneration;
    try {
      const refreshToken = web ? undefined : await loadStoredRefreshToken();
      if (!web && !refreshToken) {
        // No stored refresh token means there is no session to preserve.
        authRuntime.explicitlyLoggedOut = true;
        return false;
      }

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: web
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
        credentials: 'include',
      });

      if (!response.ok) {
        // Only an explicit rejection ends the session; a transient failure
        // (5xx during a deploy, proxy hiccup) must not destroy valid tokens.
        if (response.status === 401 || response.status === 403) {
          setWebSessionFlag(false);
          authRuntime.explicitlyLoggedOut = true;
        }
        return false;
      }

      // A logout that landed while this refresh was in flight bumps the
      // generation; don't resurrect the session by re-persisting a token.
      if (authRuntime.authGeneration !== capturedGeneration) return false;

      if (web) {
        setWebSessionFlag(true);
        authRuntime.explicitlyLoggedOut = false;
        return true;
      }

      const data = await response.json().catch(() => null);
      // Re-check after the parse await: a logout that landed while the body
      // was streaming bumps the generation, and re-persisting here would
      // resurrect the session the user just ended.
      if (authRuntime.authGeneration !== capturedGeneration) return false;
      if (typeof data?.access_token === 'string') {
        await persistAccessToken(data.access_token);
        if (typeof data.refresh_token === 'string') {
          await persistRefreshToken(data.refresh_token);
        }
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
  options: TimedRequestInit = {},
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
      // biome-ignore lint/suspicious/noUnnecessaryConditions: refreshAuthToken mutates this flag as a side effect.
    } else if (authRuntime.explicitlyLoggedOut) {
      // Refresh was rejected (or there was no session) — drop stored state.
      // A transient refresh failure leaves tokens intact for the next attempt.
      await clearCachedAuthState();
    }
  }

  return response;
}
