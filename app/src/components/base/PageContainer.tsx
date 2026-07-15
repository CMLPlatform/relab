import type { ReactNode } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

/**
 * Adaptive page scaffold: centers content at a max width with gutters that
 * widen at the md/lg breakpoints (global.css). `fullBleed` opts a hero or
 * gallery out of the constraint while keeping one wrapper element.
 *
 * `phoneFullBleed` drops the base `px-4` gutter below md, keeping the md/lg
 * gutters and desktop centering. Use it for screens whose content already owns
 * its phone horizontal padding (list/grid screens) so the scaffold's gutter
 * doesn't stack on top of it and shift the phone layout.
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
    // flex-1: several screens hand this a flex:1 child (a FlatList that must
    // fill the remaining viewport height) — without it, that child loses its
    // flex-basis chain the moment this wrapper sits between it and the
    // screen's flex:1 root. Inert when nested in a ScrollView instead (no
    // definite parent height to grow into), so it's safe for both cases.
    // Two literal className strings (not a cn() join) so NativeWind's compiler
    // statically sees every utility.
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
