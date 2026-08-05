import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { getToken, getUser, hasWebSessionFlag } from '@/services/api/auth/authentication';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';
import { AuthContext } from './auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // When the signed-in user changes, the `ownedBy: 'me'` mapping baked into
  // cached products/components is stale. Invalidate product caches so every
  // list and detail refetches with the new "me" id (or undefined on logout).
  useEffect(() => {
    if (isLoading) return;
    if (prevUserIdRef.current === user?.id) return;
    prevUserIdRef.current = user?.id;
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['baseProduct'] });
    queryClient.invalidateQueries({ queryKey: ['component'] });
  }, [user?.id, isLoading, queryClient]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);

        if (Platform.OS === 'web') {
          // Web uses HTTP-only cookies. Use a small client-visible flag set on
          // successful login to decide whether to attempt auto-login. This
          // preserves autologin for returning users while avoiding noisy 401s
          // for pure visitors.
          const hasSession = hasWebSessionFlag();
          if (hasSession) {
            const userData = await getUser(true);
            setUser(userData);
          } else {
            setUser(undefined);
          }
        } else {
          const token = await getToken();
          // No token means the visitor is a guest — skip the API call rather
          // than issue a request that would just 401.
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
