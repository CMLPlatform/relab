import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { useAppTheme } from '@/theme';

type Variant = 'display' | 'title' | 'body' | 'label' | 'data';

type AppTextProps = ComponentProps<typeof Text> & { variant?: Variant };

/** Themed text mapped to the app type scale (tokens.type). Default: body. */
export function AppText({ variant = 'body', style, ...rest }: AppTextProps) {
  const { tokens, colors } = useAppTheme();
  const scale = tokens.type[variant];
  return <Text {...rest} style={[{ color: colors.onSurface }, scale, style]} />;
}
