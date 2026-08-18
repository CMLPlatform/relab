import type { NativeStackHeaderBackProps } from 'expo-router';
import { Pressable } from 'react-native';
import { MIN_TAP_TARGET } from '@/constants';
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
      // hitSlop expands the touch target on native but is invisible to the DOM
      // on web, where this measured 36x28. Web is the shipped platform, so the
      // floor is a real box size; hitSlop stays for native comfort.
      hitSlop={12}
      style={{
        minWidth: MIN_TAP_TARGET,
        minHeight: MIN_TAP_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="chevron-left" size={28} color={color} />
    </Pressable>
  );
}
