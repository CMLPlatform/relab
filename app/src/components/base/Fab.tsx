import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { MIN_TAP_TARGET, radius } from '@/constants';
import { useAppTheme } from '@/theme';
import { Icon, type IconName } from './Icon';

// `...rest` (accessibilityHint, onLongPress, aria-*, ...) passes through;
// onPress/disabled/accessibilityState stay controlled here so the
// disabled/blocked behavior can't be clobbered by a caller override.
type FabProps = Omit<
  ComponentProps<typeof Pressable>,
  'onPress' | 'style' | 'children' | 'accessibilityLabel' | 'disabled' | 'accessibilityState'
> & {
  /** An Icon glyph name, or a render function for a custom icon (e.g. a saving spinner). */
  icon: IconName | (() => ReactNode);
  label: string;
  extended: boolean;
  onPress: () => void;
  visible?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ANIMATION_DURATION = 200;
// NOTE: fixed cap instead of the label's measured natural width — the fab's
// labels are short (save/edit/error-count copy), so a hardcoded max avoids an
// onLayout-measurement dance for a visual nicety (a few px of trailing gap on
// shorter labels) nobody will notice.
const LABEL_MAX_WIDTH = 240;

/**
 * Floating action button with extend/collapse label. Extending animates the
 * label's width and opacity via Reanimated (honoring OS reduce-motion);
 * collapsing un-mounts it immediately — the icon stays put either way.
 */
export function Fab({
  icon,
  label,
  extended,
  onPress,
  visible = true,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
  ...rest
}: FabProps) {
  const theme = useAppTheme();
  const progress = useSharedValue(extended ? 1 : 0);

  useEffect(() => {
    progress.value = extended
      ? withTiming(1, {
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        })
      : 0;
  }, [extended, progress]);

  const labelStyle = useAnimatedStyle(() => ({
    width: progress.value * LABEL_MAX_WIDTH,
    opacity: progress.value,
  }));

  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      // First so callers can still override deliberately. No className here:
      // it would drop this whole function (see IconButton.tsx).
      styles.base,
      theme.tokens.elevation.overlay,
      { backgroundColor: theme.colors.primary },
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
      style,
    ],
    [theme.tokens.elevation.overlay, theme.colors.primary, disabled, style],
  );

  if (!visible) return null;

  return (
    <Pressable
      {...rest}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={pressableStyle}
    >
      {typeof icon === 'function' ? (
        icon()
      ) : (
        <Icon name={icon} size="lg" color={theme.colors.onPrimary} />
      )}
      {extended ? (
        // Animated.View isn't a NativeWind className target (see ZoomableImage.tsx), so
        // overflow stays inline.
        <Animated.View style={[styles.labelClip, labelStyle]}>
          <AppText numberOfLines={1} className="ml-2" style={{ color: theme.colors.onPrimary }}>
            {label}
          </AppText>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.overlay,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  labelClip: {
    overflow: 'hidden',
  },
});
