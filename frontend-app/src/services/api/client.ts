import { Platform } from 'react-native';
import { fetchWithTimeout, type TimedRequestInit } from './request';

/**
 * Wrapper for fetch to automatically include credentials on Web.
 */
export async function apiFetch(
  url: string | URL,
  options: TimedRequestInit = {},
): Promise<Response> {
  const fetchOptions = { ...options };

  if (Platform.OS === 'web') {
    fetchOptions.credentials = 'include';
  }

  return fetchWithTimeout(url, fetchOptions);
}
