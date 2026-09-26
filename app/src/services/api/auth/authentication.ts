import { API_URL } from '@/config';
import { ApiError, throwFromResponse } from '@/services/api/errors';
import { fetchWithTimeout } from '@/services/api/request';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { fetchWithAuth } from './authRefresh';
import { authRuntime } from './authRuntime';
import { getUser } from './authUser';

// Return the locally-cached user without making a network request.
export function getCachedUser(): User | undefined {
  return authRuntime.user;
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const url = new URL(`${API_URL}/auth/register`);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const body = { username, email, password };

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await throwFromResponse(response, 'Registration failed. Please try again.');
    }
    return { success: true };
  } catch (error) {
    logError('[Register Error]:', error);
    if (error instanceof ApiError) return { success: false, error: error.message };
    return { success: false, error: 'Network error. Please check your connection and try again.' };
  }
}

export async function verify(email: string): Promise<boolean> {
  const url = new URL(`${API_URL}/auth/request-verify-token`);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  return response.ok;
}

export async function updateUser(updates: Partial<User>): Promise<User | undefined> {
  const url = new URL(`${API_URL}/users/me`);

  try {
    const response = await fetchWithAuth(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      await throwFromResponse(response, 'Failed to update user profile');
    }

    return await getUser(true);
  } catch (error) {
    logError('[UpdateUser Error]:', error);
    throw error;
  }
}

export async function unlinkOAuth(provider: string, currentPassword?: string): Promise<boolean> {
  const url = new URL(`${API_URL}/oauth/${provider}/associate`);

  try {
    // Accounts with a usable password must re-authenticate (step-up); OAuth-only
    // accounts have none and send no body.
    const response = await fetchWithAuth(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...(currentPassword ? { 'Content-Type': 'application/json' } : {}),
      },
      body: currentPassword ? JSON.stringify({ current_password: currentPassword }) : undefined,
    });

    if (!response.ok) {
      await throwFromResponse(response, `Failed to unlink ${provider} account`);
    }

    authRuntime.user = undefined;
    return true;
  } catch (error) {
    logError('[UnlinkOAuth Error]:', error);
    throw error;
  }
}
