import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { fetchWithTimeout } from './request';
import { API_URL } from '@/config';
import { User } from '@/types/User';

const apiURL = API_URL;
const ACCESS_TOKEN_KEY = 'access_token';
const WEB_SESSION_FLAG = 'web_has_session';
let token: string | undefined;
let user: User | undefined;
let refreshPromise: Promise<boolean> | null = null;
let getUserPromise: Promise<User | undefined> | null = null;
// When true, network auth requests should be suppressed (set on explicit logout)
let explicitlyLoggedOut = false;

const isWeb = () => Platform.OS === 'web';

async function persistAccessToken(nextToken: string): Promise<void> {
  token = nextToken;
  explicitlyLoggedOut = false;
  if (!isWeb()) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, nextToken);
  }
}

async function clearCachedAuthState(): Promise<void> {
  token = undefined;
  user = undefined;
  explicitlyLoggedOut = true;
  if (!isWeb()) {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  }
  // clear the client-visible web session flag
  try {
    if (isWeb()) window.sessionStorage.removeItem(WEB_SESSION_FLAG);
  } catch {
    /* ignore */
  }
}

function setWebSessionFlag(value: boolean) {
  if (!isWeb()) return;
  try {
    if (value) window.sessionStorage.setItem(WEB_SESSION_FLAG, '1');
    else window.sessionStorage.removeItem(WEB_SESSION_FLAG);
  } catch {
    /* ignore */
  }
}

export function markWebSessionActive(): void {
  if (!isWeb()) return;
  explicitlyLoggedOut = false;
  setWebSessionFlag(true);
}

export function hasWebSessionFlag(): boolean {
  if (!isWeb()) return false;
  try {
    return !!window.sessionStorage.getItem(WEB_SESSION_FLAG);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Core auth helpers
// ─────────────────────────────────────────────

export async function getToken(): Promise<string | undefined> {
  if (token) return token;
  if (isWeb()) return undefined;

  try {
    const storedToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (storedToken) {
      token = storedToken;
      return token;
    }
  } catch (err) {
    console.error('[GetToken Error]:', err);
  }
  return undefined;
}

export async function refreshAuthToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it instead of starting another.
  if (refreshPromise) return refreshPromise;

  // On web, skip refresh when there is no client-visible session flag.
  // On native the server will reject the request if no valid session exists.
  if (isWeb() && !hasWebSessionFlag()) return false;

  const authPath = isWeb() ? '/auth/cookie/refresh' : '/auth/refresh';
  const url = new URL(apiURL + authPath);

  refreshPromise = (async () => {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        // failed refresh; clear the web-visible session flag
        setWebSessionFlag(false);
        explicitlyLoggedOut = true;
        return false;
      }
      if (isWeb()) {
        // refresh succeeded (cookie valid)
        setWebSessionFlag(true);
        explicitlyLoggedOut = false;
        return true;
      }

      const data = await response.json().catch(() => null);
      if (typeof data?.access_token === 'string') {
        await persistAccessToken(data.access_token);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Refresh Token Error]:', err);
      return false;
    } finally {
      // clear the shared promise so future refreshes can start
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchWithAuth(url: URL | string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };

  const authToken = await getToken();
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const makeRequest = () =>
    fetchWithTimeout(url, {
      ...options,
      headers,
      credentials: 'include',
    });

  let response = await makeRequest();

  if (response.status === 401) {
    const refreshed = await refreshAuthToken();
    if (refreshed) {
      const newToken = await getToken();
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      response = await makeRequest();
    } else {
      await clearCachedAuthState();
    }
  }

  return response;
}

export async function login(username: string, password: string): Promise<string | undefined> {
  const authPath = isWeb() ? '/auth/cookie/login' : '/auth/bearer/login';
  const url = new URL(apiURL + authPath);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams({ username, password }).toString();
  const fetchOptions: RequestInit = { method: 'POST', headers, body, credentials: 'include' };

  try {
    const response = await fetchWithTimeout(url, fetchOptions);

    if (response.status === 204) {
      if (isWeb()) {
        setWebSessionFlag(true);
        explicitlyLoggedOut = false;
        // Try to confirm the cookie/session by attempting a refresh first;
        // some browsers/servers may not make the cookie available to the next
        // immediate request, so prefer refresh then a guarded getUser retry.
        try {
          const refreshed = await refreshAuthToken();
          if (refreshed) {
            await getUser(true);
          } else {
            // small delay and one final attempt to populate cache
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, 150);
              if (timer && typeof timer === 'object' && 'unref' in timer) {
                (timer as any).unref();
              }
            });
            try {
              await getUser(true);
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
      }
      return 'success';
    }
    if (response.status === 400) {
      token = undefined;
      return undefined;
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`HTTP ${response.status}: ${errorData?.detail || JSON.stringify(errorData) || 'Login failed.'}`);
    }

    if (isWeb()) {
      setWebSessionFlag(true);
      return 'success';
    }

    const data = await response.json().catch(() => null);
    if (typeof data?.access_token === 'string') {
      await persistAccessToken(data.access_token);
      return data.access_token;
    }

    return 'success';
  } catch (err: any) {
    console.error('[Login Fetch Error]:', err);
    throw new Error('Unable to reach server. Please try again later.');
  }
}

export async function logout(): Promise<void> {
  await clearCachedAuthState();
  // ensure client-visible flag cleared for web
  try {
    if (Platform.OS === 'web') window.sessionStorage.removeItem(WEB_SESSION_FLAG);
  } catch {
    /* ignore */
  }
  try {
    await fetchWithTimeout(new URL(apiURL + '/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('[Logout Fetch Error]:', err);
  }
}

export async function getUser(forceRefresh = false): Promise<User | undefined> {
  try {
    // Return cached user without any network call when data is fresh.
    if (user && !forceRefresh) return user;

    // If we've explicitly logged out, or (on web) there is no client-visible
    // session flag, avoid making any network requests; callers should treat
    // this as an unauthenticated state.
    // forceRefresh bypasses the logged-out guard on native so that a fresh
    // token obtained after login/refresh can immediately hydrate the cache.
    if (!forceRefresh && explicitlyLoggedOut) return undefined;
    if (isWeb() && !forceRefresh && !hasWebSessionFlag()) return undefined;

    if (getUserPromise && !forceRefresh) {
      return await getUserPromise;
    }

    // create a shared in-flight promise so concurrent callers reuse the same request
    getUserPromise = (async (): Promise<User | undefined> => {
      try {
        const url = new URL(apiURL + '/users/me');
        const response = await fetchWithAuth(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        let data;
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error('[GetUser Fetch Error]: Unable to parse server response.', jsonErr);
          return undefined;
        }

        if (!response.ok) {
          // 401 is expected for guests; only log other errors
          if (response.status !== 401) {
            console.error('[GetUser Fetch Error]:', data);
          }
          // If we failed to fetch the user (likely guest), ensure web flag is false
          setWebSessionFlag(false);
          return undefined;
        }

        user = {
          id: data.id,
          email: data.email,
          isActive: data.is_active,
          isSuperuser: data.is_superuser,
          isVerified: data.is_verified,
          username: data.username || 'Username not defined',
          oauth_accounts: data.oauth_accounts || [],
        };

        // successful user fetch; mark web session flag
        setWebSessionFlag(true);

        return user;
      } finally {
        getUserPromise = null;
      }
    })();

    return await getUserPromise;
  } catch (error) {
    console.error('[GetUser Fetch Error]:', error);
    return undefined;
  }
}

// Return the locally-cached user without making a network request.
export function getCachedUser(): User | undefined {
  return user;
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const url = new URL(apiURL + '/auth/register');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const body = { username, email, password };

  try {
    const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (response.ok) return { success: true };

    const errorData = await response.json();
    const errorMessage = errorData.detail?.reason || errorData.detail || 'Registration failed. Please try again.';

    return { success: false, error: errorMessage };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: 'Network error. Please check your connection and try again.' };
  }
}

export async function verify(email: string): Promise<boolean> {
  const url = new URL(apiURL + '/auth/request-verify-token');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify({ email }) });
  return response.ok;
}

export async function updateUser(updates: Partial<User>): Promise<User | undefined> {
  const url = new URL(apiURL + '/users/me');

  try {
    const response = await fetchWithAuth(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let errorMessage = 'Failed to update user profile';
      if (errorData?.detail) {
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (typeof errorData.detail === 'object') {
          errorMessage = errorData.detail.message || errorData.detail.reason || JSON.stringify(errorData.detail);
        }
      }
      throw new Error(errorMessage);
    }

    return await getUser(true);
  } catch (error) {
    console.error('[UpdateUser Error]:', error);
    throw error;
  }
}

/**
 * Exchange a Google ID token (obtained via expo-auth-session PKCE on web) for
 * app session cookies.  Sets httpOnly auth + refresh_token cookies on success.
 */
export async function oauthLoginWithGoogleToken(idToken: string, accessToken: string | null): Promise<void> {
  const url = new URL(apiURL + '/auth/oauth/google/cookie/token');
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ id_token: idToken, access_token: accessToken }),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || 'Google login failed. Please try again.');
  }
}

export async function unlinkOAuth(provider: string): Promise<boolean> {
  const url = new URL(apiURL + `/auth/oauth/${provider}/associate`);

  try {
    const response = await fetchWithAuth(url, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail || `Failed to unlink ${provider} account`);
    }

    user = undefined;
    return true;
  } catch (error) {
    console.error('[UnlinkOAuth Error]:', error);
    throw error;
  }
}
