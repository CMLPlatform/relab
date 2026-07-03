import type { ComponentProps } from 'react';
import { useAppTheme } from '@/theme';
import { Text } from './Text';

type MutedTextProps = ComponentProps<typeof Text>;

export function MutedText({ style, ...props }: MutedTextProps) {
  const theme = useAppTheme();
  return <Text {...props} style={[{ color: theme.tokens.text.muted }, style]} />;
}
