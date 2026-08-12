import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type Variant = 'display' | 'title' | 'body' | 'label' | 'data';

// Record content (body copy, data readouts) is documentation — make it
// selectable so it can be copied. Headings and labels aren't content, so they
// stay non-selectable. RN's `selectable` prop maps to CSS `user-select` on
// RN-web (react-native-web's Text applies `styles.selectable`/`notSelectable`
// based on this prop) and is a harmless no-op on native.
const SELECTABLE_VARIANTS = new Set<Variant>(['body', 'data']);

type AppTextProps = ComponentProps<typeof Text> & { variant?: Variant };

/**
 * Themed text mapped to the app type scale (tokens.type). Default: body.
 * The default color is a className (not inline style) so caller `text-*`
 * classes can override it — inline styles always beat classNames in
 * react-native-css, so a style-based default would silently eat them.
 */
export function AppText({ variant = 'body', style, className, ...rest }: AppTextProps) {
  const { tokens } = useAppTheme();
  const scale = tokens.type[variant];
  return (
    <Text
      selectable={SELECTABLE_VARIANTS.has(variant)}
      {...rest}
      className={cn('text-foreground', className)}
      style={[scale, style]}
    />
  );
}
