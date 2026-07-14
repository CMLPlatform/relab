import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Adaptive page scaffold: centers content at a max width with gutters that
 * widen at the md/lg breakpoints (global.css). `fullBleed` opts a hero or
 * gallery out of the constraint while keeping one wrapper element.
 */
export function PageContainer({
  children,
  fullBleed = false,
}: {
  children: ReactNode;
  fullBleed?: boolean;
}) {
  if (fullBleed) {
    return <View className="w-full">{children}</View>;
  }
  return (
    <View
      testID="page-container-constrained"
      className="w-full max-w-[1100px] self-center px-4 md:px-6 lg:px-8"
    >
      {children}
    </View>
  );
}
