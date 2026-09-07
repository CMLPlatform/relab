import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, type TextStyle, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useAppTheme } from '@/theme';

// One caption line at fontSize 12 — matches NewAccountSections' HELPER_SLOT_HEIGHT.
// minHeight, not height: large OS text-scale settings may still grow the line.
const HELPER_SLOT_MIN_HEIGHT = 18;

/** Field-level error with a stable `nativeID` for `describedBy` (WCAG 1.3.1 / 3.3.1 / 4.1.2). */
export function FormFieldError({
  errorId,
  message,
  style,
  reserveSpace = false,
}: {
  errorId: string;
  message: string | undefined;
  style?: TextStyle;
  /** Reserve a one-line slot so the error does not shift the form. Opt-in. */
  reserveSpace?: boolean;
}) {
  const theme = useAppTheme();

  // VoiceOver ignores accessibilityLiveRegion, so iOS gets an explicit
  // announcement. Keyed on the message so a swapped error is announced too.
  useEffect(() => {
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const errorText = message ? (
    <Animated.Text
      entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      nativeID={errorId}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      // Capped so error text stays legible instead of clipping inside
      // fixed-height helper slots at large OS text-scale settings.
      maxFontSizeMultiplier={1.5}
      // NOTE: fontSize 12 is sized to HELPER_SLOT_MIN_HEIGHT above, matching
      // NewAccountSections' fixed-height slot math — not a ramp step.
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
