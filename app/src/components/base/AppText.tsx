import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'data' | 'eyebrow';

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
 * classes can override it — inline styles always beat classNames under Uniwind,
 * so a style-based default would silently eat them.
 *
 * `maxFontSizeMultiplier` defaults to the app-wide Dynamic Type cap (2x); a
 * no-op on web, it keeps native OS text scaling from blowing out fixed
 * layouts. Callers can still override it per instance.
 */
export function AppText({
  variant = 'body',
  style,
  className,
  maxFontSizeMultiplier = 2,
  ...rest
}: AppTextProps) {
  const { tokens } = useAppTheme();
  const scale =
    variant === 'eyebrow'
      ? { ...tokens.type.label, textTransform: 'uppercase' as const }
      : tokens.type[variant];
  return (
    <Text
      selectable={SELECTABLE_VARIANTS.has(variant)}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      className={cn(variant === 'eyebrow' ? 'text-muted-foreground' : 'text-foreground', className)}
      style={[scale, style]}
    />
  );
}
