import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { RECENT_CATEGORIES_STORAGE_KEY } from '@/features/products/useRecentCategories';
import { getToken, getUser, hasWebSessionFlag } from '@/services/api/auth/authentication';
import { QUERY_CACHE_STORAGE_KEY } from '@/services/storage';
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
    const wasSignedIn = prevUserIdRef.current !== undefined;
    if (prevUserIdRef.current === user?.id) return;
    prevUserIdRef.current = user?.id;

    if (wasSignedIn && user === undefined) {
      // Sign-out, not just an account switch: on a shared device the next
      // person to open the app must not see this user's cached products,
      // profile, camera data, or recent category picks — wipe the in-memory
      // cache and both AsyncStorage-persisted copies (otherwise the query
      // cache survives up to the persister's 24h maxAge, and recents forever).
      queryClient.clear();
      void AsyncStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      void AsyncStorage.removeItem(RECENT_CATEGORIES_STORAGE_KEY);
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
