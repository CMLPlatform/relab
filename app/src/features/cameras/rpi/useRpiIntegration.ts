import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';

/**
 * RPi camera integration toggle, backed by the user's server-side preferences.
 * Works across devices — no local storage needed.
 */
export function useRpiIntegration() {
  return useServerPreferenceToggle('rpi_camera_enabled');
}
