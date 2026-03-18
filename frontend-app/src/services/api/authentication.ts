import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User } from '@/types/User';

const apiURL = `${process.env.EXPO_PUBLIC_API_URL}`;
let token: string | undefined;
let user: User | undefined;
// Prevent concurrent refresh attempts
let isRefreshing = false;

// ─────────────────────────────────────────────
// Core auth helpers
// ─────────────────────────────────────────────

export async function getToken(): Promise<string | undefined> {
  if (token) return token;
  if (Platform.OS === 'web') return undefined; // Handled via cookies on web

  try {
    const storedToken = await AsyncStorage.getItem('access_token');
    if (storedToken) {
      token = storedToken;
      return token;
    }
  } catch (err) {
    console.error('[GetToken Error]:', err);
  }
  return undefined;
}

/**
 * Attempts to refresh the access token via the backend.
 * On web: relies on the HttpOnly refresh_token cookie.
 * On native: same – React Native's fetch automatically sends cookies.
 * Returns true if a new access token was successfully obtained.
 */
export async function refreshAuthToken(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;

  // Both web (cookie) and native (cookie via RN networking) use the same endpoint
  const authPath = Platform.OS === 'web' ? '/auth/cookie/refresh' : '/auth/refresh';
  const url = new URL(apiURL + authPath);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include', // ensures cookies are sent on both web and RN
    });

    if (!response.ok) return false;

    // Bearer refresh returns a new access_token in the body
    if (Platform.OS !== 'web') {
      try {
        const data = await response.json();
        if (data.access_token) {
          await AsyncStorage.setItem('access_token', data.access_token);
          token = data.access_token;
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    // Cookie refresh sets a new auth cookie automatically – nothing else needed
    return true;
  } catch (err) {
    console.error('[Refresh Token Error]:', err);
    return false;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Wrapper around fetch that:
 *  1. Injects the Authorization header on native.
 *  2. Sends credentials (cookies) on web.
 *  3. On 401, attempts an automatic token refresh and retries once.
 *  4. On refresh failure, clears local auth state.
 */
async function fetchWithAuth(url: URL | string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };

  if (Platform.OS !== 'web') {
    const authToken = await getToken();
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
  }

  const makeRequest = () =>
    fetch(url, {
      ...options,
      headers,
      credentials: 'include', // no-op on native but essential on web
    });

  let response = await makeRequest();

  if (response.status === 401) {
    const refreshed = await refreshAuthToken();
    if (refreshed) {
      // Update header with new token for native
      if (Platform.OS !== 'web') {
        const newToken = await getToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      }
      response = await makeRequest();
    } else {
      // Refresh failed – clear local state so UI can redirect to login
      token = undefined;
      user = undefined;
      if (Platform.OS !== 'web') {
        await AsyncStorage.removeItem('access_token');
      }
    }
  }

  return response;
}

// ─────────────────────────────────────────────
// Auth actions
// ─────────────────────────────────────────────

export async function login(username: string, password: string): Promise<string | undefined> {
  const authPath = Platform.OS === 'web' ? '/auth/cookie/login' : '/auth/bearer/login';
  const url = new URL(apiURL + authPath);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams({ username, password }).toString();
  const fetchOptions: RequestInit = { method: 'POST', headers, body, credentials: 'include' };

  try {
    const response = await fetch(url, fetchOptions);

    if (response.status === 204) {
      // Cookie login – backend set cookies, nothing to parse
      return 'success';
    }

    let data;
    try {
      data = await response.json();
    } catch (err: any) {
      throw new Error(err.message || 'Unable to parse server response.');
    }

    if (response.status === 400) {
      token = undefined;
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data?.detail || JSON.stringify(data) || 'Login failed.'}`);
    }
    if (Platform.OS !== 'web' && data.access_token) {
      await AsyncStorage.setItem('access_token', data.access_token);
      token = data.access_token;
      return token;
    }

    return 'success';
  } catch (err: any) {
    console.error('[Login Fetch Error]:', err);
    throw new Error('Unable to reach server. Please try again later.');
  }
}

export async function logout(): Promise<void> {
  token = undefined;
  user = undefined;

  try {
    await fetch(new URL(apiURL + '/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('[Logout Fetch Error]:', err);
  }

  if (Platform.OS !== 'web') {
    await AsyncStorage.removeItem('access_token');
  }
}

// ─────────────────────────────────────────────
// User
// ─────────────────────────────────────────────

export async function getUser(forceRefresh = false): Promise<User | undefined> {
  try {
    if (user && !forceRefresh) return user;

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
      console.error('[GetUser Fetch Error]:', data);
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

    return user;
  } catch (error) {
    console.error('[GetUser Fetch Error]:', error);
    return undefined;
  }
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
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

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
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ email }) });
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

    user = undefined; // bust cache
    return true;
  } catch (error) {
    console.error('[UnlinkOAuth Error]:', error);
    throw error;
  }
}
