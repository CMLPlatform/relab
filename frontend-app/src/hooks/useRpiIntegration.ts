import { useCallback } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { updateUser } from '@/services/api/authentication';

/**
 * RPi camera integration toggle, backed by the user's server-side preferences.
 * Works across devices — no local storage needed.
 */
export function useRpiIntegration() {
  const { user, refetch } = useAuth();

  const enabled = user?.preferences?.rpi_camera_enabled === true;
  const loading = !user; // still fetching user

  const setEnabled = useCallback(
    async (next: boolean) => {
      await updateUser({ preferences: { rpi_camera_enabled: next } });
      await refetch(false);
    },
    [refetch],
  );

  return { enabled, loading, setEnabled };
}
