import type { ComponentProps } from 'react';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';

type MutedTextProps = ComponentProps<typeof AppText>;

/**
 * Muted secondary copy. Defaults to the `body` step; callers can override
 * `variant` (e.g. ProductCard's dense metadata lines use `caption`).
 */
export function MutedText({ className, ...props }: MutedTextProps) {
  return <AppText variant="body" {...props} className={cn('text-muted-foreground', className)} />;
}
