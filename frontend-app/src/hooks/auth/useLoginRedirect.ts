import type { Href, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { useAuth } from '@/context/auth';
import type { getUser } from '@/services/api/authentication';

export type SafeRedirectTarget = Extract<Href, string>;

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

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
  authenticatedUser: AuthenticatedUser;
  router: ReturnType<typeof useRouter>;
  postLoginRedirect?: SafeRedirectTarget;
}) {
  if (!authenticatedUser.username || authenticatedUser.username === 'Username not defined') {
    router.replace('/(auth)/onboarding');
  } else if (postLoginRedirect) {
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
