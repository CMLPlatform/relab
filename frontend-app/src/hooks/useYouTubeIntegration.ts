import { useCallback } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { updateUser } from '@/services/api/authentication';

/**
 * YouTube Live streaming integration toggle, backed by the user's server-side preferences.
 * Requires Google OAuth to be linked and RPi camera integration to be enabled.
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
