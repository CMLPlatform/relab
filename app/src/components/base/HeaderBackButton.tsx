import type { NativeStackHeaderBackProps } from 'expo-router';
import { Pressable } from 'react-native';
import { useAppTheme } from '@/theme';
import { Icon } from './Icon';

// SDK 57 dropped the importable `@react-navigation/elements` HeaderBackButton, and
// expo-router ships no replacement component — a custom `headerLeft` fully replaces the
// native back button. These screens override the back target with `router.replace`, so
// they always want a visible back affordance regardless of `canGoBack`.
type HeaderBackButtonProps = NativeStackHeaderBackProps & { onPress: () => void };

export function HeaderBackButton({ onPress, tintColor }: HeaderBackButtonProps) {
  const theme = useAppTheme();
  const color = typeof tintColor === 'string' ? tintColor : theme.colors.onBackground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={12}
      style={{ paddingHorizontal: 4 }}
    >
      <Icon name="chevron-left" size={28} color={color} />
    </Pressable>
  );
}
