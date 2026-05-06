import { API_URL } from '@/config';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { extractApiErrorDetail } from './authHelpers';
import {
  login as loginFlow,
  logout as logoutFlow,
  revokeAllSessions as revokeAllSessionsFlow,
} from './authLogin';
import {
  clearCachedAuthState,
  fetchWithAuth as fetchWithAuthFlow,
  getToken as getTokenFlow,
  persistAccessToken,
  persistRefreshToken,
  refreshAuthToken as refreshAuthTokenFlow,
} from './authRefresh';
import { authRuntime } from './authRuntime';
import { isWeb, hasWebSessionFlag as readWebSessionFlag, setWebSessionFlag } from './authSession';
import { getUser as getUserFlow } from './authUser';
import { fetchWithTimeout } from './request';

const apiURL = API_URL;

// ─────────────────────────────────────────────
// Core auth helpers
// ─────────────────────────────────────────────

export function markWebSessionActive(): void {
  if (!isWeb()) return;
  authRuntime.explicitlyLoggedOut = false;
  setWebSessionFlag(true);
}

export function hasWebSessionFlag() {
  return readWebSessionFlag();
}

export async function getToken(): Promise<string | undefined> {
  return getTokenFlow();
}

export async function refreshAuthToken(): Promise<boolean> {
  return refreshAuthTokenFlow(apiURL);
}

export async function fetchWithAuth(
  url: URL | string,
  options: RequestInit = {},
): Promise<Response> {
  return fetchWithAuthFlow(apiURL, url, options);
}

export async function login(username: string, password: string): Promise<string | undefined> {
  return loginFlow(apiURL, username, password, {
    persistAccessToken,
    persistRefreshToken,
    getUser: (forceRefresh = false) => getUser(forceRefresh),
    refreshAuthToken: () => refreshAuthToken(),
  });
}

export async function logout(): Promise<void> {
  await logoutFlow(apiURL, clearCachedAuthState);
}

export async function revokeAllSessions(): Promise<void> {
  await revokeAllSessionsFlow(apiURL, clearCachedAuthState);
}

export async function getUser(forceRefresh = false): Promise<User | undefined> {
  return getUserFlow(apiURL, fetchWithAuthFlow, forceRefresh);
}

// Return the locally-cached user without making a network request.
export function getCachedUser(): User | undefined {
  return authRuntime.user;
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const url = new URL(`${apiURL}/auth/register`);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const body = { username, email, password };

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.ok) return { success: true };

    const errorData = await response.json().catch(() => null);
    const errorMessage = extractApiErrorDetail(errorData, 'Registration failed. Please try again.');

    return { success: false, error: errorMessage };
  } catch (error) {
    logError('[Register Error]:', error);
    return { success: false, error: 'Network error. Please check your connection and try again.' };
  }
}

export async function verify(email: string): Promise<boolean> {
  const url = new URL(`${apiURL}/auth/request-verify-token`);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  return response.ok;
}

export async function updateUser(updates: Partial<User>): Promise<User | undefined> {
  const url = new URL(`${apiURL}/users/me`);

  try {
    const response = await fetchWithAuth(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const detail = errorData?.detail;
      throw new Error(
        typeof detail === 'string'
          ? detail
          : (detail?.message ??
              detail?.reason ??
              JSON.stringify(detail) ??
              'Failed to update user profile'),
      );
    }

    return await getUser(true);
  } catch (error) {
    logError('[UpdateUser Error]:', error);
    throw error;
  }
}

export async function unlinkOAuth(provider: string): Promise<boolean> {
  const url = new URL(`${apiURL}/oauth/${provider}/associate`);

  try {
    const response = await fetchWithAuth(url, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(extractApiErrorDetail(errorData, `Failed to unlink ${provider} account`));
    }

    authRuntime.user = undefined;
    return true;
  } catch (error) {
    logError('[UnlinkOAuth Error]:', error);
    throw error;
  }
}
