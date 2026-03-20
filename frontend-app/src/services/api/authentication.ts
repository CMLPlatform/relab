import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User } from '@/types/User';

const apiURL = `${process.env.EXPO_PUBLIC_API_URL}`;
const ACCESS_TOKEN_KEY = 'access_token';
let token: string | undefined;
let user: User | undefined;
let isRefreshing = false;

const isWeb = () => Platform.OS === 'web';

async function persistAccessToken(nextToken: string): Promise<void> {
  token = nextToken;
  if (!isWeb()) {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, nextToken);
  }
}

async function clearCachedAuthState(): Promise<void> {
  token = undefined;
  user = undefined;
  if (!isWeb()) {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

// ─────────────────────────────────────────────
// Core auth helpers
// ─────────────────────────────────────────────

export async function getToken(): Promise<string | undefined> {
  if (token) return token;
  if (isWeb()) return undefined;

  try {
    const storedToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
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
  if (isRefreshing) return false;
  isRefreshing = true;

  const authPath = isWeb() ? '/auth/cookie/refresh' : '/auth/refresh';
  const url = new URL(apiURL + authPath);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) return false;
    if (isWeb()) return true;

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
    isRefreshing = false;
  }
}

async function fetchWithAuth(url: URL | string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };

  const authToken = await getToken();
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const makeRequest = () =>
    fetch(url, {
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
    const response = await fetch(url, fetchOptions);

    if (response.status === 204) return 'success';
    if (response.status === 400) {
      token = undefined;
      return undefined;
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`HTTP ${response.status}: ${errorData?.detail || JSON.stringify(errorData) || 'Login failed.'}`);
    }

    if (isWeb()) return 'success';

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

  try {
    await fetch(new URL(apiURL + '/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('[Logout Fetch Error]:', err);
  }
}

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

    user = undefined;
    return true;
  } catch (error) {
    console.error('[UnlinkOAuth Error]:', error);
    throw error;
  }
}
