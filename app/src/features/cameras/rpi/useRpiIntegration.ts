import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';

/** RPi camera integration toggle, backed by the user's server-side preferences. */
export function useRpiIntegration() {
  return useServerPreferenceToggle('rpi_camera_enabled');
}
