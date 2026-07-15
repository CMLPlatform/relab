import type { ReactNode } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

/**
 * Adaptive page scaffold: centers content at a max width with gutters that
 * widen at the md/lg breakpoints (global.css). `fullBleed` opts a hero or
 * gallery out of the constraint while keeping one wrapper element.
 */
export function PageContainer({
  children,
  fullBleed = false,
  onLayout,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  if (fullBleed) {
    return (
      <View className="w-full" onLayout={onLayout}>
        {children}
      </View>
    );
  }
  return (
    // flex-1: several screens hand this a flex:1 child (a FlatList that must
    // fill the remaining viewport height) — without it, that child loses its
    // flex-basis chain the moment this wrapper sits between it and the
    // screen's flex:1 root. Inert when nested in a ScrollView instead (no
    // definite parent height to grow into), so it's safe for both cases.
    <View
      testID="page-container-constrained"
      className="w-full max-w-[1100px] flex-1 self-center px-4 md:px-6 lg:px-8"
      onLayout={onLayout}
    >
      {children}
    </View>
  );
}
