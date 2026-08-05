import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { getPublicProfile } from '@/services/api/profiles';

/**
 * The one public-profile query, shared by the own-profile stats and the public
 * profile screen so both hit the same cache entry.
 *
 * The viewer id is part of the key because visibility rules depend on who is
 * asking — the profile must refetch when the viewer logs in or out.
 */
export function usePublicProfileQuery(username: string | null | undefined) {
  const { user: viewer } = useAuth();
  const {
    data = null,
    isPending,
    error,
  } = useQuery({
    queryKey: ['publicProfile', username ?? null, viewer?.id ?? null],
    queryFn: () => getPublicProfile(username as string),
    enabled: Boolean(username),
  });

  return { profile: username ? data : null, loading: Boolean(username) && isPending, error };
}
