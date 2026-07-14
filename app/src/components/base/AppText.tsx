import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type Variant = 'display' | 'title' | 'body' | 'label' | 'data';

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
  return <Text {...rest} className={cn('text-foreground', className)} style={[scale, style]} />;
}
