import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useAuth } from '@/context/auth';
import { useAppTheme } from '@/theme';
import { needsUsernameOnboarding } from '@/utils/router/onboarding';
import { createHeaderRightPillStyles } from '@/utils/router/styles';
import { Text } from './Text';

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
        accessibilityRole="button"
        accessibilityLabel={needsOnboarding ? 'Complete profile' : `Account: ${username}`}
      >
        <MaterialCommunityIcons name="account-circle" size={18} color={theme.colors.onBackground} />
        <Text style={primaryText} numberOfLines={1}>
          {username}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={goToLogin}
      style={pill}
      accessibilityRole="button"
      accessibilityLabel="Sign in"
    >
      <Text style={primaryText}>Sign in</Text>
    </Pressable>
  );
}
