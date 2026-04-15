import { useCallback, useEffect, useState } from 'react';
import { getPublicProfile, type PublicProfileView } from '@/services/api/profiles';
import { logError } from '@/utils/logging';

export function useOwnProfileStats(username?: string) {
  const [ownStats, setOwnStats] = useState<PublicProfileView | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadOwnStats = useCallback(async () => {
    if (!username) return;
    setStatsLoading(true);
    try {
      const stats = await getPublicProfile(username);
      setOwnStats(stats);
    } catch (error) {
      logError('Failed to load own stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void loadOwnStats();
  }, [loadOwnStats]);

  return {
    state: {
      stats: ownStats,
      loading: statsLoading,
    },
    actions: {
      reload: loadOwnStats,
    },
  };
}
