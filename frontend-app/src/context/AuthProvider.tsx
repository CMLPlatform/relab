import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { AuthContext } from '@/context/auth';
import { getToken, getUser, hasWebSessionFlag } from '@/services/api/authentication';
import type { User } from '@/types/User';
import { logError } from '@/utils/logging';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Check token and load user if valid
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
          // If no token, skip API call—user is a guest
          if (!token) {
            setUser(undefined);
            return;
          }
          // Token exists; validate it by fetching user
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
    initializeAuth().catch(() => {});
  }, []);

  const refetch = useCallback(async (forceRefresh = true) => {
    const userData = await getUser(forceRefresh);
    setUser(userData);
  }, []);

  const contextValue = useMemo(() => ({ user, isLoading, refetch }), [user, isLoading, refetch]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
