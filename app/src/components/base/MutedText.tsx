import type { ComponentProps } from 'react';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';

type MutedTextProps = Omit<ComponentProps<typeof AppText>, 'variant'>;

/**
 * Muted secondary copy. Its call sites are explanatory sentences and empty
 * states, so it rides the `body` step; the two dense card lines in ProductCard
 * pin their own smaller size/lineHeight via `style`.
 */
export function MutedText({ className, ...props }: MutedTextProps) {
  return <AppText variant="body" {...props} className={cn('text-muted-foreground', className)} />;
}
