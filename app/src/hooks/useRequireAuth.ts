import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/context/auth';
import { useScreenFocusedSafe } from '@/hooks/useScreenFocused';
import type { User } from '@/types/User';

/**
 * Guard effect behind `useRequireAuth`. Gated on `isLoading` (no flash during
 * session restore), screen focus (an off-focus tab screen must not redirect),
 * and `isLoggingOut`.
 */
function useAuthRedirectGuard({
  user,
  isLoading,
  isLoggingOut,
  router,
  redirectTo,
}: {
  user: User | undefined;
  isLoading: boolean;
  isLoggingOut: boolean;
  router: ReturnType<typeof useRouter>;
  redirectTo: string;
}) {
  const isFocused = useScreenFocusedSafe();

  useEffect(() => {
    if (!isFocused || isLoading || isLoggingOut || user) return;
    router.replace({ pathname: '/login', params: { redirectTo } });
  }, [isFocused, isLoading, isLoggingOut, user, redirectTo, router]);
}

/** Redirect to /login (preserving a post-login target) when there is no authenticated user. */
export function useRequireAuth(redirectTo: string, options?: { isLoggingOut?: boolean }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useAuthRedirectGuard({
    user,
    isLoading,
    isLoggingOut: options?.isLoggingOut ?? false,
    router,
    redirectTo,
  });

  return { user, isLoading };
}
