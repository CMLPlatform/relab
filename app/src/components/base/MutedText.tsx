import type { ComponentProps } from 'react';
import { useAppTheme } from '@/theme';
import { AppText } from './AppText';

type MutedTextProps = Omit<ComponentProps<typeof AppText>, 'variant'>;

export function MutedText({ style, ...props }: MutedTextProps) {
  const theme = useAppTheme();
  return <AppText variant="plain" {...props} style={[{ color: theme.tokens.text.muted }, style]} />;
}
