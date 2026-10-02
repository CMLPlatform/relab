import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { DOCS_URL } from '@/config';
import { WEB_FOCUS_RING } from '@/constants';
import { openExternalUrl } from '@/services/externalLinks';
import { cn } from '@/utils/cn';
import { PRESS_TINT } from './pressFeedback';

/** Caption-sized link into the docs, rendered only when a docs URL is configured. */
export function DocsLink({
  path,
  children,
  accessibilityLabel,
  className,
}: {
  /** Path within the docs site, e.g. `/user-guides/data-collection`. */
  path: string;
  children: string;
  accessibilityLabel: string;
  className?: string;
}) {
  const open = useCallback(() => {
    if (DOCS_URL) {
      void openExternalUrl(new URL(path, DOCS_URL).toString());
    }
  }, [path]);

  if (!DOCS_URL) {
    return null;
  }
  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      className={cn(
        'min-h-11 justify-center rounded-md',
        className ?? 'py-2',
        PRESS_TINT,
        WEB_FOCUS_RING,
      )}
    >
      <AppText variant="caption" className="text-primary underline">
        {children}
      </AppText>
    </Pressable>
  );
}
