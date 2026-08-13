import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/context/auth';
import { useScreenFocusedSafe } from '@/hooks/useScreenFocused';
import type { User } from '@/types/User';

/**
 * Shared guard effect behind `useRequireAuth`. Exposed separately so
 * `useProfileAuthRedirect` (`@/features/profile/state`) — whose sole call
 * site already sources `profile`/`router` itself, rather than reading them
 * from context the way this hook does — can share the same redirect logic
 * without duplicating it.
 *
 * Gated on:
 *  - `isLoading`, so a slow initial session restore can't flash a logged-in
 *    user to the login screen;
 *  - screen focus, so a screen that stays mounted off-focus (tab groups
 *    preserve per-tab state) can't fire a stale redirect after its own
 *    navigation has already moved elsewhere;
 *  - `isLoggingOut`, for the same reason during an in-flight logout.
 */
export function useAuthRedirectGuard({
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

/**
 * Redirect to /login (preserving a post-login target) when there is no
 * authenticated user. See `useAuthRedirectGuard` for the gating rules.
 */
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
