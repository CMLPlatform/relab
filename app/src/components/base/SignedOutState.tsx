import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** Replaces `if (!user) return null` blank screens with an explanation and a way in. */
export function SignedOutState({
  message = 'Sign in to use this part of Relab.',
}: {
  message?: string;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Icon name="lock" size={48} color={colors.onSurfaceVariant} />
      <AppText className="text-center opacity-70">{message}</AppText>
      <AppButton variant="primary" onPress={() => router.replace('/login')} className="mt-2">
        Sign in
      </AppButton>
    </View>
  );
}
