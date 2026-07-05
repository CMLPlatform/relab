import { API_URL } from '@/config';
import { apiFetch } from '@/services/api/client';
import { throwFromResponse } from '@/services/api/errors';

/**
 * Password-reset and email-verification endpoints. These throw ApiError (via
 * the shared response parser) on failure, so callers get the backend detail —
 * including validation arrays and {message}/{reason} objects — instead of only
 * a bare `detail` string, and branch on ApiError for API vs network failures.
 */

async function postJson(path: string, body: unknown, fallbackError: string): Promise<void> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) await throwFromResponse(response, fallbackError);
}

export function requestPasswordReset(email: string): Promise<void> {
  return postJson('/auth/forgot-password', { email }, 'Failed to send reset email');
}

export function resetPassword(token: string, password: string): Promise<void> {
  return postJson('/auth/reset-password', { token, password }, 'Password reset failed');
}

export function verifyEmail(token: string): Promise<void> {
  return postJson('/auth/verify', { token }, 'Verification failed. Please try registering again.');
}
