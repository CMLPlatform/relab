import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { extractApiErrorDetail, getAuthLoginPath } from './authHelpers';
import { authRuntime } from './authRuntime';
import { isWeb, setWebSessionFlag } from './authSession';
import { fetchWithTimeout } from './request';

export async function login(
  apiUrl: string,
  username: string,
  password: string,
  deps: {
    persistAccessToken: (token: string) => Promise<void>;
    getUser: (forceRefresh?: boolean) => Promise<User | undefined>;
    refreshAuthToken: () => Promise<boolean>;
  },
): Promise<string | undefined> {
  const authPath = getAuthLoginPath(isWeb());
  const url = new URL(apiUrl + authPath);
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
      if (isWeb()) {
        setWebSessionFlag(true);
        authRuntime.explicitlyLoggedOut = false;
        try {
          const refreshed = await deps.refreshAuthToken();
          if (refreshed) {
            await deps.getUser(true);
          } else {
            await new Promise<void>((resolve) => setTimeout(resolve, 150));
            await deps.getUser(true).catch(() => {
              /* ignore */
            });
          }
        } catch {
          /* ignore */
        }
      }
      return 'success';
    }

    if (response.status === 400) {
      authRuntime.token = undefined;
      return undefined;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        `HTTP ${response.status}: ${extractApiErrorDetail(errorData, 'Login failed.')}`,
      );
    }

    if (isWeb()) {
      setWebSessionFlag(true);
      return 'success';
    }

    const data = await response.json().catch(() => null);
    if (typeof data?.access_token === 'string') {
      await deps.persistAccessToken(data.access_token);
      return data.access_token;
    }

    return 'success';
  } catch (err) {
    logError('[Login Fetch Error]:', err);
    throw new Error('Unable to reach server. Please try again later.');
  }
}

export async function logout(
  apiUrl: string,
  clearCachedAuthState: () => Promise<void>,
): Promise<void> {
  await clearCachedAuthState();
  try {
    await fetchWithTimeout(new URL(`${apiUrl}/auth/logout`), {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    logError('[Logout Fetch Error]:', err);
  }
}
