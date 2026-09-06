import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';

/**
 * YouTube Live toggle, backed by server-side preferences. The flag is the
 * source of truth: base and YouTube-scoped Google OAuth share one
 * `oauth_name = "google"` row.
 */
export function useYouTubeIntegration() {
  return useServerPreferenceToggle('youtube_streaming_enabled');
}
