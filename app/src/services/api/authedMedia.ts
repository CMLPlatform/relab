import { useEffect, useMemo, useState } from 'react';
import { getToken } from '@/services/api/auth/authentication';
import { isWeb } from '@/services/storage';

/**
 * Credentials for media served by owner-checked API routes (camera thumbnails,
 * relayed LL-HLS).
 *
 * - Web: the same-site `__Host-` cookie is sent on subresource requests. Never
 *   pass `headers` on web: expo-image then uses a `fetch()` without
 *   `credentials`, which drops the cookie (401).
 * - Native: bearer token via an explicit `headers` map.
 */
export type AuthedMediaSource = { uri: string; headers?: Record<string, string> };

/**
 * Player/image source that authenticates on both platforms. `null` while a
 * native token is resolving. Memoized: expo-image and expo-video key reloads
 * off source identity.
 */
export function useAuthedMediaSource(uri: string | null | undefined): AuthedMediaSource | null {
  const web = isWeb();
  const [token, setToken] = useState<string>();

  useEffect(() => {
    if (web || !uri) {
      return;
    }
    let active = true;
    // Re-read whenever the URL changes (previews carry a `?v=<mtime>` cache
    // buster), so a token rotated by the refresh flow is picked up without
    // subscribing to auth state here.
    void getToken().then((value) => {
      if (active) {
        setToken(value);
      }
    });
    return () => {
      active = false;
    };
  }, [uri, web]);

  return useMemo(() => {
    if (!uri) {
      return null;
    }
    if (web) {
      return { uri };
    }
    return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : null;
  }, [uri, token, web]);
}
