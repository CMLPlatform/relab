import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { getPublicProfile } from '@/services/api/profiles';

/**
 * The signed-in user's own public-profile stats.
 *
 * Shares react-query's cache with `usePublicProfileScreen`, which fetches the same
 * endpoint — viewing your own public profile no longer refetches it. The key
 * carries the viewer id because visibility rules depend on who is asking.
 */
export function useOwnProfileStats(username?: string) {
  const { user: viewer } = useAuth();
  const viewerId = viewer?.id ?? null;

  const {
    data: stats = null,
    isPending,
    error,
  } = useQuery({
    queryKey: ['publicProfile', username ?? null, viewerId],
    queryFn: () => getPublicProfile(username as string),
    enabled: Boolean(username),
  });

  return {
    state: {
      stats: username ? stats : null,
      loading: Boolean(username) && isPending,
      error: error ?? null,
    },
  };
}
