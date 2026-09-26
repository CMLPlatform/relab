import { API_URL } from '@/config';
import { ApiError, throwFromResponse } from '@/services/api/errors';
import { fetchWithTimeout, TimeoutError } from '@/services/api/request';
import { isWeb } from '@/services/storage';
import { logError } from '@/utils/logging';
import { getAuthLoginPath } from './authHelpers';
import { type MfaLoginPending, parseMfaPendingPayload } from './authMfa';
import { clearCachedAuthState, persistAccessToken, persistRefreshToken } from './authRefresh';
import { authRuntime } from './authRuntime';
import { loadStoredAccessToken, loadStoredRefreshToken, markWebSessionActive } from './authSession';
import { getUser } from './authUser';

const UNREACHABLE_SERVER_MESSAGE = 'Unable to reach server. Please try again later.';

export type LoginResult =
  | { status: 'authenticated' }
  | MfaLoginPending
  | { status: 'invalid_credentials' };

export async function login(username: string, password: string): Promise<LoginResult> {
  const web = isWeb();
  const authPath = getAuthLoginPath(web);
  const url = new URL(API_URL + authPath);
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
        // The 204 already set both cookies. Prewarm the user cache;
        // AuthProvider re-fetches anyway.
        markWebSessionActive();
        await getUser(true).catch(() => {
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

    // Native logs in with bearer tokens: no access token means no session.
    if (typeof data?.access_token !== 'string') {
      throw new Error('Invalid login response.');
    }

    await persistAccessToken(data.access_token);
    if (typeof data.refresh_token === 'string') {
      await persistRefreshToken(data.refresh_token);
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

export async function logout(): Promise<void> {
  const web = isWeb();
  const refreshToken = web ? undefined : await loadStoredRefreshToken();
  const logoutPath = web ? '/auth/session/logout' : '/auth/bearer/logout';
  const body = refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined;
  const headers = await getNativeAuthorizationHeaders();
  if (refreshToken) {
    headers['Content-Type'] = 'application/json';
  }

  // Revoke server-side first, else a failed request leaves the refresh token
  // valid. The local clear runs regardless; the log is the only failure signal.
  try {
    const response = await fetchWithTimeout(new URL(`${API_URL}${logoutPath}`), {
      method: 'POST',
      headers,
      body,
      credentials: 'include',
    });
    if (!response.ok) logError('[Logout Failed]: server responded', response.status);
  } catch (err) {
    logError('[Logout Fetch Error]:', err);
  } finally {
    await clearCachedAuthState();
  }
}

export async function revokeAllSessions(): Promise<void> {
  const headers = await getNativeAuthorizationHeaders();

  // Same ordering as logout(): revoke while the credentials are still cached.
  try {
    const response = await fetchWithTimeout(new URL(`${API_URL}/auth/sessions/revoke-all`), {
      method: 'POST',
      headers,
      credentials: 'include',
    });
    if (!response.ok) logError('[Revoke All Sessions Failed]: server responded', response.status);
  } catch (err) {
    logError('[Revoke All Sessions Fetch Error]:', err);
  } finally {
    await clearCachedAuthState();
  }
}

async function getNativeAuthorizationHeaders(): Promise<Record<string, string>> {
  const web = isWeb();
  const accessToken = authRuntime.token ?? (web ? undefined : await loadStoredAccessToken());
  return web || !accessToken ? {} : { Authorization: `Bearer ${accessToken}` };
}
