import { usePublicProfileQuery } from './publicProfileQuery';

/** The signed-in user's own public-profile stats. */
export function useOwnProfileStats(username?: string) {
  const { profile, loading, error } = usePublicProfileQuery(username);

  return {
    state: {
      stats: profile,
      loading,
      error: error ?? null,
    },
  };
}
