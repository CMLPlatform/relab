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

    const sequence = ++authRuntime.getUserSequence;
    const promise = (async (): Promise<User | undefined> => {
      const capturedGeneration = authRuntime.authGeneration;
      const url = new URL(`${apiUrl}/users/me`);
      const response = await fetchWithAuth(apiUrl, url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Definitive rejection — the session is gone.
          setWebSessionFlag(false);
        } else {
          // Transient server error; keep the session flag so later
          // fetches retry instead of treating the user as signed out.
          logError('[GetUser] HTTP', response.status);
        }
        return;
      }

      if (authRuntime.authGeneration !== capturedGeneration) return;

      const data = (await response.json().catch((err: unknown) => {
        logError('[GetUser] Failed to parse response:', err);
        return;
      })) as ApiUserRead | undefined;
      if (!data) return;

      // A newer getUser started while this one was in flight — don't let a
      // stale response overwrite fresher data (e.g. a post-update refetch).
      if (authRuntime.getUserSequence !== sequence) return authRuntime.user;

      authRuntime.user = mapApiUserToUser(data);
      setWebSessionFlag(true);
      return authRuntime.user;
    })();

    authRuntime.getUserPromise = promise;
    try {
      return await promise;
    } finally {
      // Only clear the slot if a newer request hasn't already replaced it.
      if (authRuntime.getUserPromise === promise) authRuntime.getUserPromise = null;
    }
  } catch (error) {
    logError('[GetUser Fetch Error]:', error);
    return;
  }
}
