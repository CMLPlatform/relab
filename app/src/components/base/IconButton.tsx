import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { useAppTheme } from '@/theme/appThemeContext';
import { cn } from '@/utils/cn';
import { Icon, type IconName } from './Icon';
import { PRESS_FADE, type PressState, pressFill } from './pressFeedback';

// `onPress`/`disabled`/`accessibilityState` stay controlled here so the loading
// behavior cannot be clobbered; the rest passes through.
type IconButtonProps = Omit<
  ComponentProps<typeof Pressable>,
  'onPress' | 'style' | 'children' | 'accessibilityLabel' | 'disabled' | 'accessibilityState'
> & {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Icon-only pressable with >=44px touch target regardless of glyph visual size. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 24,
  loading = false,
  style,
  testID,
  className,
  ...rest
}: IconButtonProps) {
  const theme = useAppTheme();
  const pressableStyle = useCallback(
    (state: PressState) => [
      // First so callers can still override deliberately.
      styles.base,
      !loading && pressFill(state, theme.tokens.surface.accent),
      style,
    ],
    [theme.tokens.surface.accent, loading, style],
  );

  return (
    <Pressable
      {...rest}
      onPress={loading ? undefined : onPress}
      disabled={loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // aria-*, not accessibilityState: only the aria props reach the DOM on web.
      aria-busy={loading}
      aria-disabled={loading}
      hitSlop={8}
      className={cn(PRESS_FADE, className)}
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
  base: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
});
