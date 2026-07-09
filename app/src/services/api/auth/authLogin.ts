import { ApiError, throwFromResponse } from '@/services/api/errors';
import { fetchWithTimeout, TimeoutError } from '@/services/api/request';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { getAuthLoginPath } from './authHelpers';
import { type MfaLoginPending, parseMfaPendingPayload } from './authMfa';
import { authRuntime } from './authRuntime';
import {
  isWeb,
  loadStoredAccessToken,
  loadStoredRefreshToken,
  markWebSessionActive,
} from './authSession';

const UNREACHABLE_SERVER_MESSAGE = 'Unable to reach server. Please try again later.';

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
        // The 204 already carries both the access and refresh cookies (backend
        // `issue_session_login_response`), and they are committed by the time
        // this response resolves — so there is nothing to refresh and nothing
        // to wait for. Prewarm the user cache; AuthProvider re-fetches anyway.
        markWebSessionActive();
        await deps.getUser(true).catch(() => {
          /* the session is valid; AuthProvider will fetch the user again */
        });
      }
      return { status: 'authenticated' };
    }

    if (response.status === 400) {
      authRuntime.token = undefined;
      return { status: 'invalid_credentials' };
    }

    if (!response.ok) {
      await throwFromResponse(response, 'Login failed.');
    }

    const data = await response.json().catch(() => null);
    const mfaPending = parseMfaPendingPayload(data);
    if (response.status === 202 && mfaPending) return mfaPending;

    if (web) {
      markWebSessionActive();
      return { status: 'authenticated' };
    }

    // Native logs in with bearer tokens: no access token means no session, so
    // never report success — the app would route into a signed-in UI whose
    // every request 401s.
    if (typeof data?.access_token !== 'string') {
      throw new Error('Invalid login response.');
    }

    await deps.persistAccessToken(data.access_token);
    if (typeof data.refresh_token === 'string') {
      await deps.persistRefreshToken(data.refresh_token);
    }
    return { status: 'authenticated' };
  } catch (err) {
    logError('[Login Fetch Error]:', err);
    // Surface the backend's detail, but never a raw transport error string
    // ("Network request failed", "Request timed out after 15000ms").
    if (err instanceof ApiError) throw err;
    if (err instanceof TimeoutError || err instanceof TypeError) {
      throw new Error(UNREACHABLE_SERVER_MESSAGE);
    }
    if (err instanceof Error) throw err;
    throw new Error(UNREACHABLE_SERVER_MESSAGE);
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
