import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from '@/components/base/AppText';
import { radius, spacing } from '@/constants';
import { useAppTheme } from '@/theme';

type FabProps = {
  /** A MaterialCommunityIcons glyph name, or a render function for a custom icon (e.g. a saving spinner). */
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'] | (() => ReactNode);
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
 * Floating action button with an extend/collapse label, replacing
 * react-native-paper's AnimatedFAB. Extending animates the label's width and
 * opacity in via Reanimated (honoring the OS reduce-motion setting);
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
}: FabProps) {
  const theme = useAppTheme();
  const progress = useSharedValue(extended ? 1 : 0);

  useEffect(() => {
    progress.value = extended
      ? withTiming(1, { duration: ANIMATION_DURATION, reduceMotion: ReduceMotion.System })
      : 0;
  }, [extended, progress]);

  const labelStyle = useAnimatedStyle(() => ({
    width: progress.value * LABEL_MAX_WIDTH,
    opacity: progress.value,
  }));

  if (!visible) return null;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.colors.primaryContainer },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {typeof icon === 'function' ? (
        icon()
      ) : (
        <MaterialCommunityIcons name={icon} size={24} color={theme.colors.onPrimaryContainer} />
      )}
      {extended ? (
        <Animated.View style={[styles.labelClip, labelStyle]}>
          <AppText
            numberOfLines={1}
            style={[styles.label, { color: theme.colors.onPrimaryContainer }]}
          >
            {label}
          </AppText>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    elevation: 4,
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
  label: {
    marginLeft: spacing.sm,
  },
});
