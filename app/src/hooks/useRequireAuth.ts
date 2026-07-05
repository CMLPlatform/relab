import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/context/auth';

/**
 * Redirect to /login (preserving a post-login target) when there is no
 * authenticated user. Gated on the initial auth check so a slow session
 * restore can't flash a logged-in user to the login screen.
 */
export function useRequireAuth(redirectTo: string) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || user) return;
    router.replace({ pathname: '/login', params: { redirectTo } });
  }, [isLoading, user, redirectTo, router]);

  return { user, isLoading };
}
