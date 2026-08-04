import { useEffect, useMemo, useState } from 'react';
import { getToken } from '@/services/api/auth/authentication';
import { isWeb } from '@/services/storage';

/**
 * Credentials for media served by owner-checked API routes (camera preview
 * thumbnails, relayed LL-HLS), which `<Image>`/`<VideoView>` cannot authenticate
 * on their own.
 *
 * The two platforms authenticate differently and must be handled differently:
 *
 * - **Web** authenticates with the `__Host-` session cookie. The app
 *   (app.cml-relab.org) and the API (api.cml-relab.org) share the registrable
 *   domain, so they are *same-site* and the `SameSite=Lax` cookie is sent on
 *   plain subresource requests. Passing `headers` here would be actively
 *   harmful: expo-image's web path swaps the `<img>` for a `fetch()` that sets
 *   no `credentials`, which drops the cookie and turns a working request into a
 *   401. So web gets a bare `{ uri }` and relies on the cookie.
 * - **Native** has no cookie and carries a bearer token, which the players can
 *   only send through an explicit `headers` map.
 */
export type AuthedMediaSource = { uri: string; headers?: Record<string, string> };

/**
 * Build a player/image source that authenticates on both platforms.
 *
 * Returns `null` while a native token is still resolving, so callers render their
 * placeholder instead of firing a spurious load error. The returned object is
 * memoized because both `expo-image` and `expo-video` key reloads off source
 * identity — an inline object literal would refetch on every render.
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
