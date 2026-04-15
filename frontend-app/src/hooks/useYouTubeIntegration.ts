import { useCallback } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { unlinkOAuth } from '@/services/api/authentication';

/**
 * YouTube Live streaming integration toggle.
 *
 * "Enabled" is derived from whether a `google-youtube` OAuth account is
 * linked — the authoritative source of truth in the database — rather than
 * a user-preference flag that can drift out of sync across logins.
 *
 * Toggling OFF unlinks the `google-youtube` OAuth account.
 * Toggling ON is handled externally (OAuth flow in profile.tsx); after a
 * successful grant, callers should call `refetch()` to update the state.
 */
export function useYouTubeIntegration() {
  const { user, refetch } = useAuth();

  const enabled =
    user?.oauth_accounts?.some((a) => a.oauth_name === 'google-youtube') ?? false;
  const loading = !user;

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!next) {
        await unlinkOAuth('google-youtube');
        await refetch(false);
      }
      // Enabling is handled externally by the OAuth associate flow.
    },
    [refetch],
  );

  return { enabled, loading, setEnabled };
}
