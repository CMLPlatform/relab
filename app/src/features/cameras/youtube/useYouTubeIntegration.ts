import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';

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
  return useServerPreferenceToggle('youtube_streaming_enabled');
}
