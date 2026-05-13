import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { extractApiErrorDetail, getAuthLoginPath } from './authHelpers';
import { type MfaLoginPending, parseMfaPendingPayload } from './authMfa';
import { authRuntime } from './authRuntime';
import {
  isWeb,
  loadStoredAccessToken,
  loadStoredRefreshToken,
  setWebSessionFlag,
} from './authSession';
import { fetchWithTimeout } from './request';

export type LoginResult =
  | { status: 'authenticated' }
  | MfaLoginPending
  | { status: 'invalid_credentials' };

export async function login(
  apiUrl: string,
  username: string,
  password: string,
  deps: {
    persistAccessToken: (token: string) => Promise<void>;
    persistRefreshToken: (token: string) => Promise<void>;
    getUser: (forceRefresh?: boolean) => Promise<User | undefined>;
    refreshAuthToken: () => Promise<boolean>;
  },
): Promise<LoginResult> {
  const web = isWeb();
  const authPath = getAuthLoginPath(web);
  const url = new URL(apiUrl + authPath);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  const body = new URLSearchParams({ username, password }).toString();

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    });

    if (response.status === 204) {
      if (web) {
        setWebSessionFlag(true);
        authRuntime.explicitlyLoggedOut = false;
        try {
          const refreshed = await deps.refreshAuthToken();
          if (refreshed) {
            await deps.getUser(true);
          } else {
            // The browser may not have processed the session cookie from the login
            // response by the time the next request fires. A short delay lets the
            // cookie become available so getUser() can authenticate successfully.
            await new Promise<void>((resolve) => setTimeout(resolve, 150));
            await deps.getUser(true).catch(() => {
              /* ignore */
            });
          }
        } catch {
          /* ignore */
        }
      }
      return { status: 'authenticated' };
    }

    if (response.status === 400) {
      authRuntime.token = undefined;
      return { status: 'invalid_credentials' };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(extractApiErrorDetail(errorData, 'Login failed.'));
    }

    const data = await response.json().catch(() => null);
    const mfaPending = parseMfaPendingPayload(data);
    if (response.status === 202 && mfaPending) return mfaPending;

    if (web) {
      setWebSessionFlag(true);
      return { status: 'authenticated' };
    }

    if (typeof data?.access_token === 'string') {
      await deps.persistAccessToken(data.access_token);
      if (typeof data.refresh_token === 'string') {
        await deps.persistRefreshToken(data.refresh_token);
      }
      return { status: 'authenticated' };
    }

    return { status: 'authenticated' };
  } catch (err) {
    logError('[Login Fetch Error]:', err);
    if (err instanceof Error) throw err;
    throw new Error('Unable to reach server. Please try again later.');
  }
}

export async function logout(
  apiUrl: string,
  clearCachedAuthState: () => Promise<void>,
): Promise<void> {
  const web = isWeb();
  const refreshToken = web ? undefined : await loadStoredRefreshToken();
  const logoutPath = web ? '/auth/session/logout' : '/auth/bearer/logout';
  const body = refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined;
  const headers = await getNativeAuthorizationHeaders();
  if (refreshToken) {
    headers['Content-Type'] = 'application/json';
  }

  await clearCachedAuthState();
  try {
    await fetchWithTimeout(new URL(`${apiUrl}${logoutPath}`), {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    });
  } catch (err) {
    logError('[Logout Fetch Error]:', err);
  }
}

export async function revokeAllSessions(
  apiUrl: string,
  clearCachedAuthState: () => Promise<void>,
): Promise<void> {
  const headers = await getNativeAuthorizationHeaders();

  await clearCachedAuthState();
  try {
    await fetchWithTimeout(new URL(`${apiUrl}/auth/sessions/revoke-all`), {
      method: 'POST',
      headers,
      credentials: 'include',
    });
  } catch (err) {
    logError('[Revoke All Sessions Fetch Error]:', err);
  }
}

async function getNativeAuthorizationHeaders(): Promise<Record<string, string>> {
  const web = isWeb();
  const accessToken = authRuntime.token ?? (web ? undefined : await loadStoredAccessToken());
  return web || !accessToken ? {} : { Authorization: `Bearer ${accessToken}` };
}
