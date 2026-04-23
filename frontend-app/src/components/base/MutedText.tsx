import type { ComponentProps } from 'react';
import { Text } from '@/components/base/Text';
import { useAppTheme } from '@/theme';

type MutedTextProps = ComponentProps<typeof Text>;

export function MutedText({ style, ...props }: MutedTextProps) {
  const theme = useAppTheme();
  return <Text {...props} style={[{ color: theme.tokens.text.muted }, style]} />;
}
