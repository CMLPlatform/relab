import type { Href, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { useAuth } from '@/context/auth';
import { needsUsernameOnboarding } from '@/lib/router/onboarding';
import type { User } from '@/types/User';

export type SafeRedirectTarget = Extract<Href, string>;

export function getSafeRedirectTarget(
  redirectTo: string | string[] | undefined,
): SafeRedirectTarget | undefined {
  if (
    typeof redirectTo !== 'string' ||
    !redirectTo.startsWith('/') ||
    redirectTo.startsWith('//')
  ) {
    return;
  }

  try {
    const resolved = new URL(redirectTo, 'https://placeholder.invalid');
    if (resolved.origin !== 'https://placeholder.invalid') {
      return;
    }
  } catch {
    return;
  }

  return redirectTo as SafeRedirectTarget;
}

export function routeAuthenticatedUser({
  authenticatedUser,
  router,
  postLoginRedirect,
}: {
  authenticatedUser: User;
  router: ReturnType<typeof useRouter>;
  postLoginRedirect?: SafeRedirectTarget;
}) {
  if (needsUsernameOnboarding(authenticatedUser)) {
    router.replace('/onboarding');
    return;
  }

  if (postLoginRedirect) {
    router.replace(postLoginRedirect);
  } else {
    router.replace({ pathname: '/products' });
  }
}

export function useAuthenticatedUserRedirect({
  authLoading,
  user,
  router,
  postLoginRedirect,
}: {
  authLoading: boolean;
  user: ReturnType<typeof useAuth>['user'];
  router: ReturnType<typeof useRouter>;
  postLoginRedirect?: SafeRedirectTarget;
}) {
  useEffect(() => {
    if (authLoading || !user) return;
    routeAuthenticatedUser({
      authenticatedUser: user,
      router,
      postLoginRedirect,
    });
  }, [authLoading, postLoginRedirect, router, user]);
}
