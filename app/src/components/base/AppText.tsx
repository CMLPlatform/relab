import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'data' | 'eyebrow';

// Record content (body, data) is selectable so it can be copied; headings and
// labels are not. `selectable` maps to CSS `user-select` on web.
const SELECTABLE_VARIANTS = new Set<Variant>(['body', 'data']);

type AppTextProps = ComponentProps<typeof Text> & { variant?: Variant };

/**
 * Themed text mapped to the app type scale (tokens.type). Default: body.
 * The default color is a className so caller `text-*` classes can override it
 * (inline styles beat classNames under Uniwind).
 * `maxFontSizeMultiplier` defaults to the app-wide Dynamic Type cap (2x).
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
