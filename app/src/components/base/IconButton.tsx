import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { MIN_TAP_TARGET } from '@/constants';
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
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      // NOTE: duplicates the min-h-11/min-w-11 classes below numerically, so
      // the 44px a11y tap-target floor stays test-visible even if the
      // Tailwind scale or rem basis ever drifts. Kept first so callers can
      // still override deliberately.
      styles.tapTarget,
      mode === 'contained-tonal' && { backgroundColor: theme.colors.secondaryContainer },
      pressed && !loading && styles.pressed,
      style,
    ],
    [mode, theme.colors.secondaryContainer, loading, style],
  );

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
      className="min-h-11 min-w-11 items-center justify-center rounded-md"
      style={pressableStyle}
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
  tapTarget: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
  },
  pressed: {
    opacity: 0.6,
  },
});
