import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { getToken, getUser, hasWebSessionFlag } from '@/services/api/auth/authentication';
import { clearPersistedUserData } from '@/services/storage';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { AuthContext } from './auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // The `ownedBy: 'me'` mapping baked into cached products is stale when the user changes.
  useEffect(() => {
    if (isLoading) return;
    const wasSignedIn = prevUserIdRef.current !== undefined;
    if (prevUserIdRef.current === user?.id) return;
    prevUserIdRef.current = user?.id;

    if (wasSignedIn && user === undefined) {
      // Shared device: wipe the in-memory cache and both persisted copies, or
      // the next user sees this one's data (query cache lives 24h, recents forever).
      queryClient.clear();
      void clearPersistedUserData();
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['baseProduct'] });
    queryClient.invalidateQueries({ queryKey: ['component'] });
  }, [user, isLoading, queryClient]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);

        if (Platform.OS === 'web') {
          // Web uses HTTP-only cookies; a client-visible flag set on login
          // decides whether to attempt auto-login (avoids 401s for visitors).
          const hasSession = hasWebSessionFlag();
          if (hasSession) {
            const userData = await getUser(true);
            setUser(userData);
          } else {
            setUser(undefined);
          }
        } else {
          const token = await getToken();
          // No token: guest, skip the 401.
          if (!token) {
            setUser(undefined);
            return;
          }
          const userData = await getUser(true);
          setUser(userData);
        }
      } catch (error) {
        logError('[AuthProvider] Initialization error:', error);
        setUser(undefined);
      } finally {
        setIsLoading(false);
      }
    };
    void initializeAuth();
  }, []);

  const refetch = useCallback(async (forceRefresh = true) => {
    const userData = await getUser(forceRefresh);
    setUser(userData);
    return userData;
  }, []);

  const contextValue = useMemo(() => ({ user, isLoading, refetch }), [user, isLoading, refetch]);

  if (isLoading) {
    return <CenteredSpinner />;
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
