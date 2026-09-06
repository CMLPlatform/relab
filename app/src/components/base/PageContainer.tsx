import type { ReactNode } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

/**
 * Adaptive page scaffold: max-width column with gutters that widen at md/lg.
 * `fullBleed` opts out of the constraint; `phoneFullBleed` drops only the
 * base `px-4` gutter below md, for screens that own their phone padding.
 */
export function PageContainer({
  children,
  fullBleed = false,
  phoneFullBleed = false,
  onLayout,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  phoneFullBleed?: boolean;
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
    // flex-1 keeps a flex:1 child's (FlatList) flex-basis chain intact; inert
    // inside a ScrollView. Two literal strings so the compiler sees every utility.
    <View
      testID="page-container-constrained"
      className={
        phoneFullBleed
          ? 'w-full max-w-[1100px] flex-1 self-center md:px-6 lg:px-8'
          : 'w-full max-w-[1100px] flex-1 self-center px-4 md:px-6 lg:px-8'
      }
      onLayout={onLayout}
    >
      {children}
    </View>
  );
}
