import type { TextStyle } from 'react-native';
import { Text } from 'react-native';
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
    <Text
      nativeID={errorId}
      accessibilityRole="alert"
      style={[{ color: theme.tokens.status.danger, fontSize: 12 }, style]}
    >
      {message}
    </Text>
  );
}
