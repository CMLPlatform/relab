import { StyleSheet, type TextStyle, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useAppTheme } from '@/theme';

// One caption line at fontSize 12 — matches NewAccountSections' HELPER_SLOT_HEIGHT.
// minHeight, not height: large OS text-scale settings may still grow the line.
const HELPER_SLOT_MIN_HEIGHT = 18;

/**
 * Renders a field-level error message with a stable `nativeID`, so the input
 * can be linked to it via `describedBy` (`@/utils/a11y`) instead of rendering
 * as an unlinked sibling <Text> (WCAG 1.3.1 / 3.3.1 / 4.1.2 — programmatic
 * error association, not just a color change on the input).
 */
export function FormFieldError({
  errorId,
  message,
  style,
  reserveSpace = false,
}: {
  errorId: string;
  message: string | undefined;
  style?: TextStyle;
  /**
   * Always render a one-line helper slot so the error fills reserved space
   * instead of shoving the rest of the form down. The fade below bridges the
   * text's appearance; only the reserved slot prevents the layout shift.
   * Opt-in: mixed view/edit layouts (product headers, video fields) keep the
   * conditional render rather than carrying a permanent empty line.
   */
  reserveSpace?: boolean;
}) {
  const theme = useAppTheme();
  const errorText = message ? (
    <Animated.Text
      entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      nativeID={errorId}
      accessibilityRole="alert"
      // Capped so error text stays legible instead of clipping inside
      // fixed-height helper slots at large OS text-scale settings.
      maxFontSizeMultiplier={1.5}
      style={[{ color: theme.tokens.status.danger, fontSize: 12 }, style]}
    >
      {message}
    </Animated.Text>
  ) : null;

  if (!reserveSpace) return errorText;
  return <View style={styles.slot}>{errorText}</View>;
}

const styles = StyleSheet.create({
  slot: {
    minHeight: HELPER_SLOT_MIN_HEIGHT,
    justifyContent: 'center',
  },
});
