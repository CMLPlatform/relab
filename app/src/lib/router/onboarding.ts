import type { User } from '@/types/User';

type UsernameOnboardingUser = Pick<User, 'username'> | null | undefined;

export function needsUsernameOnboarding(user: UsernameOnboardingUser): boolean {
  return Boolean(user && !user.username);
}

export function getUsernameOnboardingRedirect({
  user,
  pathname,
}: {
  user: User | undefined;
  pathname: string;
}): '/onboarding' | '/products' | null {
  if (!user) return null;

  const isOnboardingPath = pathname === '/onboarding' || pathname.endsWith('/onboarding');
  if (needsUsernameOnboarding(user) && !isOnboardingPath) return '/onboarding';
  if (!needsUsernameOnboarding(user) && isOnboardingPath) return '/products';
  return null;
}
