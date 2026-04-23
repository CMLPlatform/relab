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
    if (!username) {
      return;
    }

    let cancelled = false;
    const currentUsername = username;

    async function loadStats() {
      setStatsLoading(true);
      try {
        const stats = await getPublicProfile(currentUsername);
        if (!cancelled) {
          setOwnStats(stats);
        }
      } catch (error) {
        logError('Failed to load own stats:', error);
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [username]);

  return {
    state: {
      stats: username ? ownStats : null,
      loading: username ? statsLoading : false,
    },
    actions: {
      reload: loadOwnStats,
    },
  };
}
