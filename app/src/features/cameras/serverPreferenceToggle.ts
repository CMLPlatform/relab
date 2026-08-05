import { useCallback } from 'react';
import { useAuth } from '@/context/auth';
import { updateUser } from '@/services/api/auth/authentication';
import type { UserPreferences } from '@/types/User';

/**
 * A boolean integration toggle stored in the user's server-side preferences, so it
 * follows the account across devices. Only the toggled key is written — the server
 * merges it into whatever else is stored.
 */
export function useServerPreferenceToggle(key: keyof UserPreferences & string) {
  const { user, isLoading, refetch } = useAuth();

  const setEnabled = useCallback(
    async (next: boolean) => {
      await updateUser({ preferences: { [key]: next } });
      await refetch(false);
    },
    [key, refetch],
  );

  return { enabled: user?.preferences?.[key] === true, loading: isLoading, setEnabled };
}
