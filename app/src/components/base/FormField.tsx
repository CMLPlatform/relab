import type { TextStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useAppTheme } from '@/theme';

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
}: {
  errorId: string;
  message: string | undefined;
  style?: TextStyle;
}) {
  const theme = useAppTheme();
  if (!message) return null;
  return (
    // Errors used to appear and vanish in a single frame, shoving the rest of
    // the form down with them. The fade is a bridge, not decoration: it stays
    // under the 150ms feedback budget, and Reanimated drops it on its own when
    // the OS asks for reduced motion. The alert role fires on mount regardless.
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
  );
}
