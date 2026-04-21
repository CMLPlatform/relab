import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { createHeaderRightPillStyles } from '@/app/layout/styles';
import { Text } from '@/components/base/Text';
import { useAuth } from '@/context/auth';
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
    const username = truncateUsername(user.username);
    return (
      <Pressable
        onPress={() => router.push('/profile')}
        style={pill}
        accessibilityRole="button"
        accessibilityLabel={`Profile: ${username}`}
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
