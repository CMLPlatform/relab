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

  const isOnboardingPath = pathname.endsWith('/onboarding');
  const needsOnboarding = needsUsernameOnboarding(user);
  if (needsOnboarding && !isOnboardingPath) return '/onboarding';
  if (!needsOnboarding && isOnboardingPath) return '/products';
  return null;
}
