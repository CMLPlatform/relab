import type { ComponentProps } from 'react';
import { cn } from '@/utils/cn';
import { AppText } from './AppText';

type MutedTextProps = ComponentProps<typeof AppText>;

/** Muted secondary copy. Defaults to the `body` step. */
export function MutedText({ className, ...props }: MutedTextProps) {
  return <AppText variant="body" {...props} className={cn('text-muted-foreground', className)} />;
}
