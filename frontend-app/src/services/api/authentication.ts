import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User } from '@/types/User';

const baseUrl = `${process.env.EXPO_PUBLIC_API_URL}`;
const isWeb = Platform.OS === 'web';
let token: string | undefined;
let user: User | undefined;

export async function login(username: string, password: string): Promise<string | undefined> {
  // Use cookie-based auth for web, bearer token for native
  const authEndpoint = isWeb ? '/auth/cookie/login' : '/auth/bearer/login';
  const url = new URL(baseUrl + authEndpoint);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams({ username, password }).toString();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      credentials: isWeb ? 'include' : 'same-origin', // Include cookies for web
    });
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

    if (isWeb) {
      // For web, the token is stored in HTTP-only cookie by the backend
      // We set a flag to indicate successful authentication
      token = 'cookie-auth';
      return token;
    } else {
      // For native, store the token in AsyncStorage (not credentials)
      token = data.access_token;
      await AsyncStorage.setItem('auth_token', token);
      return token;
    }
  } catch (err: any) {
    console.error('[Login Fetch Error]:', err);
    throw new Error('Unable to reach server. Please try again later.');
  }
}

export async function logout(): Promise<void> {
  token = undefined;
  user = undefined;

  if (isWeb) {
    // For web, call the logout endpoint to clear the cookie
    try {
      const url = new URL(baseUrl + '/auth/cookie/logout');
      await fetch(url, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('[Logout Error]:', err);
    }
  } else {
    // For native, remove the stored token
    await AsyncStorage.removeItem('auth_token');
  }
}

export async function getToken(): Promise<string | undefined> {
  if (token) {
    return token;
  }

  if (isWeb) {
    // For web, verify if we have a valid session cookie
    try {
      const url = new URL(baseUrl + '/users/me');
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        // Cookie is valid
        token = 'cookie-auth';
        return token;
      }
    } catch (err) {
      console.error('[GetToken Error]:', err);
    }
    return undefined;
  } else {
    // For native, try to get the stored token
    const storedToken = await AsyncStorage.getItem('auth_token');
    if (storedToken) {
      token = storedToken;
      return token;
    }
    return undefined;
  }
}

export async function getUser(): Promise<User | undefined> {
  try {
    if (user) {
      return user;
    }

    const url = new URL(baseUrl + '/users/me');
    const authToken = await getToken();
    if (!authToken) {
      return undefined;
    }

    const headers: HeadersInit = { Accept: 'application/json' };
    const fetchOptions: RequestInit = { method: 'GET', headers };

    if (isWeb) {
      // For web, use cookies for authentication
      fetchOptions.credentials = 'include';
    } else {
      // For native, use Bearer token
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, fetchOptions);

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
    };

    return user;
  } catch (error) {
    console.error('[GetUser Fetch Error]:', error);
    return undefined;
  }
}

export async function register(username: string, email: string, password: string): Promise<boolean> {
  const url = new URL(baseUrl + '/auth/register');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  const body = {
    username: username,
    email: email,
    password: password,
  };

  const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  return response.ok;
}

export async function verify(email: string): Promise<boolean> {
  const url = new URL(baseUrl + '/auth/request-verify-token');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  const body = {
    email: email,
  };

  const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  return response.ok;
}
