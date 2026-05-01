import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Text } from '@/components/base/Text';
import { useAuth } from '@/context/auth';
import { needsUsernameOnboarding } from '@/lib/router/onboarding';
import { createHeaderRightPillStyles } from '@/lib/router/styles';
import { useAppTheme } from '@/theme';

function truncateUsername(username: string) {
  return username.length > 16 ? `${username.slice(0, 14)}…` : username;
}

export function HeaderRightPill() {
  const { user } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();
  const { pill, primaryText } = createHeaderRightPillStyles(theme);

  if (user) {
    const needsOnboarding = needsUsernameOnboarding(user);
    const username = needsOnboarding ? 'Complete profile' : truncateUsername(user.username ?? '');
    return (
      <Pressable
        onPress={() => router.push(needsOnboarding ? '/onboarding' : '/profile')}
        style={pill}
        accessibilityRole="button"
        accessibilityLabel={needsOnboarding ? 'Complete profile' : `Profile: ${username}`}
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
      onPress={() => router.push('/login')}
      style={pill}
      accessibilityRole="button"
      accessibilityLabel="Sign in"
    >
      <Text style={primaryText}>Sign In</Text>
    </Pressable>
  );
}
