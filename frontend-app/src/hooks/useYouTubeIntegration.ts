import { useCallback } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { updateUser } from '@/services/api/authentication';

/**
 * YouTube Live streaming integration toggle, backed by the user's server-side
 * preferences (persisted in the database).
 *
 * The `youtube_streaming_enabled` preference flag is the source of truth
 * because both the base Google OAuth and the YouTube-scoped Google OAuth share
 * the same `oauth_name = "google"` row — we can't distinguish them from the
 * oauth_accounts list alone.
 */
export function useYouTubeIntegration() {
  const { user, refetch } = useAuth();

  const enabled = user?.preferences?.youtube_streaming_enabled === true;
  const loading = !user;

  const setEnabled = useCallback(
    async (next: boolean) => {
      await updateUser({ preferences: { youtube_streaming_enabled: next } });
      await refetch(false);
    },
    [refetch],
  );

  return { enabled, loading, setEnabled };
}
