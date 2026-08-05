import type { ComponentProps } from 'react';
import { useAppTheme } from '@/theme';
import { AppText } from './AppText';

type MutedTextProps = Omit<ComponentProps<typeof AppText>, 'variant'>;

/**
 * Muted secondary copy. Its call sites are explanatory sentences and empty
 * states, so it rides the `body` step; the two dense card lines in ProductCard
 * pin their own smaller size/lineHeight via `style`.
 */
export function MutedText({ style, ...props }: MutedTextProps) {
  const theme = useAppTheme();
  return <AppText variant="body" {...props} style={[{ color: theme.tokens.text.muted }, style]} />;
}
