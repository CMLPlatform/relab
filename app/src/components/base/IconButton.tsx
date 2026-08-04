import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { radius } from '@/constants';
import { useAppTheme } from '@/theme';
import { Icon, type IconName } from './Icon';

// Everything not already named below (accessibilityHint, onLongPress, aria-*,
// ...) passes through via `...rest`; `onPress`/`disabled`/`accessibilityState`
// stay controlled by this component so the loading behavior can't be
// clobbered by a caller-supplied override.
type IconButtonProps = Omit<
  ComponentProps<typeof Pressable>,
  'onPress' | 'style' | 'children' | 'accessibilityLabel' | 'disabled' | 'accessibilityState'
> & {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  loading?: boolean;
  mode?: 'default' | 'contained-tonal';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Icon-only pressable, replacing react-native-paper's IconButton. Touch target stays >=44px regardless of the glyph's visual `size`. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 24,
  loading = false,
  mode = 'default',
  style,
  testID,
  ...rest
}: IconButtonProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      {...rest}
      onPress={loading ? undefined : onPress}
      disabled={loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: loading, busy: loading }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        mode === 'contained-tonal' && { backgroundColor: theme.colors.secondaryContainer },
        pressed && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.onSurface} />
      ) : (
        <Icon name={icon} size={size} color={theme.colors.onSurface} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  pressed: {
    opacity: 0.6,
  },
});
