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
import { useAppTheme } from '@/theme/appThemeContext';
import { Icon, type IconName } from './Icon';
import { PRESS_FADE } from './pressFeedback';

// onPress/disabled/accessibilityState stay controlled here so the blocked
// behavior cannot be clobbered; the rest passes through.
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
const LABEL_MAX_WIDTH = 240;
const LABEL_SLIDE = 12;

/** FAB with extend/collapse label. Extending animates; collapsing unmounts immediately. */
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

  // Transform and opacity only: the label is sized to content up to 240, then
  // truncated, so large text is not clipped by an animated width.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * -LABEL_SLIDE }],
  }));

  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      // First so callers can override.
      styles.base,
      theme.tokens.elevation.overlay,
      { backgroundColor: pressed && !disabled ? theme.colors.primaryStrong : theme.colors.primary },
      disabled && styles.disabled,
      style,
    ],
    [
      theme.tokens.elevation.overlay,
      theme.colors.primary,
      theme.colors.primaryStrong,
      disabled,
      style,
    ],
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
      className={PRESS_FADE}
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
  labelClip: {
    maxWidth: LABEL_MAX_WIDTH,
    overflow: 'hidden',
  },
});
