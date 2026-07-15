import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@/utils/cn';

interface Props extends Omit<ViewProps, 'children'> {
  children: ReactNode;
  className?: string;
}

/** Plain card surface — border + rounded corners on the theme's card background. */
export function Card({ children, className, ...props }: Props) {
  return (
    <View className={cn('bg-card border border-border rounded-lg', className)} {...props}>
      {children}
    </View>
  );
}
