import type { ApiUserRead } from '@/types/api';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { mapApiUserToUser, shouldSkipUserFetch } from './authHelpers';
import { authRuntime } from './authRuntime';
import { hasWebSessionFlag, isWeb, setWebSessionFlag } from './authSession';

export async function getUser(
  apiUrl: string,
  fetchWithAuth: (apiUrl: string, url: URL | string, options?: RequestInit) => Promise<Response>,
  forceRefresh = false,
): Promise<User | undefined> {
  try {
    if (authRuntime.user && !forceRefresh) return authRuntime.user;

    if (
      shouldSkipUserFetch({
        forceRefresh,
        explicitlyLoggedOut: authRuntime.explicitlyLoggedOut,
        web: isWeb(),
        hasWebSession: hasWebSessionFlag(),
      })
    ) {
      return;
    }

    if (authRuntime.getUserPromise && !forceRefresh) {
      return await authRuntime.getUserPromise;
    }

    authRuntime.getUserPromise = (async (): Promise<User | undefined> => {
      const capturedGeneration = authRuntime.authGeneration;
      try {
        const url = new URL(`${apiUrl}/users/me`);
        const response = await fetchWithAuth(apiUrl, url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          if (response.status !== 401) {
            logError('[GetUser] HTTP', response.status);
          }
          setWebSessionFlag(false);
          return;
        }

        if (authRuntime.authGeneration !== capturedGeneration) return;

        const data = (await response.json().catch((err: unknown) => {
          logError('[GetUser] Failed to parse response:', err);
          return;
        })) as ApiUserRead | undefined;
        if (!data) return;

        authRuntime.user = mapApiUserToUser(data);
        setWebSessionFlag(true);
        return authRuntime.user;
      } finally {
        authRuntime.getUserPromise = null;
      }
    })();

    return await authRuntime.getUserPromise;
  } catch (error) {
    logError('[GetUser Fetch Error]:', error);
    return;
  }
}
