import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { getPublicProfile } from '@/services/api/profiles';

/**
 * The one public-profile query. The viewer id is part of the key: visibility
 * depends on who is asking.
 */
export function usePublicProfileQuery(username: string | null | undefined) {
  const { user: viewer } = useAuth();
  const {
    data = null,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['publicProfile', username ?? null, viewer?.id ?? null],
    queryFn: () => getPublicProfile(username as string),
    enabled: Boolean(username),
  });

  return {
    profile: username ? data : null,
    loading: Boolean(username) && isPending,
    error,
    refetch,
  };
}
