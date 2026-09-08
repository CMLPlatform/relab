import type { NativeStackHeaderBackProps } from 'expo-router';
import { Pressable } from 'react-native';
import { MIN_TAP_TARGET, WEB_FOCUS_RING } from '@/constants';
import { useAppTheme } from '@/theme';
import { Icon } from './Icon';

// SDK 57 dropped `@react-navigation/elements` HeaderBackButton. Callers override
// the back target with `router.replace`, so the affordance ignores `canGoBack`.
type HeaderBackButtonProps = NativeStackHeaderBackProps & { onPress: () => void };

export function HeaderBackButton({ onPress, tintColor }: HeaderBackButtonProps) {
  const theme = useAppTheme();
  const color = typeof tintColor === 'string' ? tintColor : theme.colors.onBackground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      // hitSlop is invisible to the DOM on web, so the box itself carries the floor.
      hitSlop={12}
      className={WEB_FOCUS_RING}
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
