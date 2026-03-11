import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User } from '@/types/User';

const apiURL = `${process.env.EXPO_PUBLIC_API_URL}`;
let token: string | undefined;
let user: User | undefined;

export async function login(username: string, password: string): Promise<string | undefined> {
  const authPath = Platform.OS === 'web' ? '/auth/cookie/login' : '/auth/bearer/login';
  const url = new URL(apiURL + authPath);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams({ username, password }).toString();
  const fetchOptions: RequestInit = { method: 'POST', headers, body };
  if (Platform.OS === 'web') {
    fetchOptions.credentials = 'include';
  }

  try {
    const response = await fetch(url, fetchOptions);
    
    if (response.status === 204) {
      // Cookie login returns 204 No Content
      return 'success';
    }

    let data;
    try {
      data = await response.json();
    } catch (err: any) {
      throw new Error(err.message || 'Unable to parse server response.');
    }
    if (response.status === 400) {
      // NOTE: FastAPI-User implementation of the backend returns 400 on invalid login
      token = undefined;
      return undefined;
    }
    if (!response.ok) {
      // Throw error with HTTP status and message
      throw new Error(`HTTP ${response.status}: ${data?.detail || JSON.stringify(data) || 'Login failed.'}`);
    }
    if (Platform.OS !== 'web' && data.access_token) {
      await AsyncStorage.setItem('access_token', data.access_token);
      token = data.access_token;
      return token;
    }
    
    // For web, the cookie is set by the server. We don't have a token.
    return 'success';
  } catch (err: any) {
    console.error('[Login Fetch Error]:', err);
    throw new Error('Unable to reach server. Please try again later.');
  }
}

export async function logout(): Promise<void> {
  token = undefined;
  user = undefined;
  if (Platform.OS !== 'web') {
    await AsyncStorage.removeItem('access_token');
  } else {
    try {
      await fetch(new URL(apiURL + '/auth/cookie/logout'), { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('[Logout Fetch Error]:', err);
    }
  }
}

export async function getToken(): Promise<string | undefined> {
  if (token) {
    return token;
  }

  if (Platform.OS === 'web') {
    return undefined; // Tokens are not used on the frontend for Web (managed by browser cookies)
  }

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

export async function getUser(forceRefresh = false): Promise<User | undefined> {
  try {
    if (user && !forceRefresh) {
      return user;
    }

    const url = new URL(apiURL + '/users/me');
    const headers: any = { Accept: 'application/json' };
    
    if (Platform.OS !== 'web') {
      const authToken = await getToken();
      if (!authToken) {
        return undefined;
      }
      headers.Authorization = `Bearer ${authToken}`;
    }

    // Include credentials for web so cookies are sent
    const response = await fetch(url, { method: 'GET', headers, credentials: 'include' });

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

  const body = {
    username: username,
    email: email,
    password: password,
  };

  try {
    const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });

    if (response.ok) {
      return { success: true };
    }

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

  const body = {
    email: email,
  };

  const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  return response.ok;
}

export async function updateUser(updates: Partial<User>): Promise<User | undefined> {
  const url = new URL(apiURL + '/users/me');
  const headers: any = { 'Content-Type': 'application/json', Accept: 'application/json' };
  
  if (Platform.OS !== 'web') {
    const authToken = await getToken();
    if (!authToken) throw new Error("Not authenticated");
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
      ...(Platform.OS === 'web' ? { credentials: 'include' } : {})
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
    
    // Force refresh the user with fresh data from backend
    return await getUser(true);
  } catch (error) {
    console.error('[UpdateUser Error]:', error);
    throw error;
  }
}

export async function unlinkOAuth(provider: string): Promise<boolean> {
  const url = new URL(apiURL + `/auth/oauth/${provider}/associate`);
  const headers: any = { Accept: 'application/json' };
  
  if (Platform.OS !== 'web') {
    const authToken = await getToken();
    if (!authToken) throw new Error("Not authenticated");
    headers.Authorization = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      ...(Platform.OS === 'web' ? { credentials: 'include' } : {})
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail || `Failed to unlink ${provider} account`);
    }
    
    // Clear user cache so next profile fetch is crisp
    user = undefined;
    return true;
  } catch (error) {
    console.error('[UnlinkOAuth Error]:', error);
    throw error;
  }
}
