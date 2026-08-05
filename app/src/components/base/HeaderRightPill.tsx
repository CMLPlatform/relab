import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useAuth } from '@/context/auth';
import { useAppTheme } from '@/theme';
import { needsUsernameOnboarding } from '@/utils/router/onboarding';
import { createHeaderRightPillStyles } from '@/utils/router/styles';
import { AppText } from './AppText';
import { Icon } from './Icon';

function truncateUsername(username: string) {
  return username.length > 16 ? `${username.slice(0, 14)}…` : username;
}

export function HeaderRightPill() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();
  const { pill, primaryText } = createHeaderRightPillStyles(theme);
  const needsOnboarding = user ? needsUsernameOnboarding(user) : false;

  const goToAccount = useCallback(() => {
    router.push(needsOnboarding ? '/onboarding' : '/account');
  }, [router, needsOnboarding]);
  const goToLogin = useCallback(() => router.push('/login'), [router]);

  if (user) {
    const username = needsOnboarding ? 'Complete profile' : truncateUsername(user.username ?? '');
    return (
      <Pressable
        onPress={goToAccount}
        style={pill}
        // ~32px pill + 6px hitSlop/side = 44px tap target (a11y floor).
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={needsOnboarding ? 'Complete profile' : `Account: ${username}`}
      >
        <Icon name="account-circle" size={18} color={theme.colors.onPrimaryContainer} />
        <AppText variant="plain" style={primaryText} numberOfLines={1}>
          {username}
        </AppText>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={goToLogin}
      style={pill}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Sign in"
    >
      <AppText variant="plain" style={primaryText}>
        Sign in
      </AppText>
    </Pressable>
  );
}
