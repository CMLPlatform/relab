import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type OverlaySurfaceProps = {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  className?: string;
  /** 'surface' is an opaque panel for dialogs; the rest are translucent films drawn over content. */
  tone?: 'surface' | 'scrim' | 'media' | 'glass';
};

export function OverlaySurface({
  children,
  style,
  className,
  tone = 'scrim',
}: OverlaySurfaceProps) {
  const theme = useAppTheme();
  // 'surface' is CSS-var-backed (bg-background); the other tones are JS-only
  // overlay tokens, so their color has to stay inline.
  return (
    <View
      // Floating chrome (tooltips, toasts, dialog surfaces): overlay radius.
      className={cn('rounded-xl', tone === 'surface' && 'bg-background', className)}
      style={[tone !== 'surface' && { backgroundColor: theme.tokens.overlay[tone] }, style]}
    >
      {children}
    </View>
  );
}
