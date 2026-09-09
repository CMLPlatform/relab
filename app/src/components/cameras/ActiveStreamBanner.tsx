import { usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/base/AppText';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { useStreamSession } from '@/context/streamSession';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useElapsed } from '@/hooks/useElapsed';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme, useInverseSurface } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';
import { StreamingSheet } from './StreamingSheet';

// Baseline float above the bottom edge, before any tab-bar clearance.
// Native 88 clears a Fab: MIN_TAP_TARGET (44) tall, docked 16px from the
// bottom, so its top edge sits ~60px up. Routes without a Fab get a cosmetic gap.
// The banner is mounted at the app root, outside the tab navigator, so when the
// bar renders the banner adds BOTTOM_NAV_CLEARANCE plus the bar's safe-area
// padding back (0 on web); without the safe-area term a notched device puts the
// banner through a detail screen's Fab.
const BASE_BOTTOM_INSET = Platform.OS === 'web' ? 16 : 88;

// SaveBar (FabControls.tsx) docks at right:24/bottom:24 on >=md web detail
// routes ('/products/:id', '/components/:id'; the `new` screens have no
// SaveBar). The banner cannot read SaveBar's edit/ownership state, so it
// reserves the zone whenever the route+breakpoint could render it; read-only
// visitors get an empty 400px gap. Keep in sync with the back-references in
// SaveBar.tsx / FabControls.tsx.
const SAVE_BAR_DOCK_ROUTE = /^\/(products|components)\/(?!new$)[^/]+$/;
// Not exported (react-refresh/only-export-components); the test duplicates it.
// Estimate of SaveBar's widest content, not a measured value.
const SAVE_BAR_DOCK_RESERVE = 400;
// Below md the SaveBar sits in flow above BottomNav; reserve the tallest
// two-row SaveBar. Absolute baseline from the tab scene's bottom, not additive.
const FLOW_SAVE_BAR_CLEARANCE = 120;

export function ActiveStreamBanner() {
  const theme = useAppTheme();
  const inverse = useInverseSurface();
  const { activeStream } = useStreamSession();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const openSheet = useCallback(() => setSheetVisible(true), []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const bannerRef = useReturnFocus(sheetVisible);
  const bottomNavVisible = useBottomNavVisible();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { isMd } = useBreakpoint();
  const detailRoute = SAVE_BAR_DOCK_ROUTE.test(pathname);
  const flowSaveBarActive = !isMd && detailRoute;
  const baseBottomInset = flowSaveBarActive
    ? Math.max(BASE_BOTTOM_INSET, FLOW_SAVE_BAR_CLEARANCE)
    : BASE_BOTTOM_INSET;
  const bottomInset = bottomNavVisible
    ? baseBottomInset + BOTTOM_NAV_CLEARANCE + insets.bottom
    : baseBottomInset;
  const saveBarDockActive = Platform.OS === 'web' && isMd && detailRoute;
  const rightInset = saveBarDockActive ? SAVE_BAR_DOCK_RESERVE : 16;

  // Reset the sheet when the active stream changes so it never auto-reopens
  // for a stream the user did not tap into.
  const [trackedStream, setTrackedStream] = useState(activeStream);
  if (activeStream !== trackedStream) {
    setTrackedStream(activeStream);
    setSheetVisible(false);
  }

  if (!activeStream) return null;

  return (
    <>
      <View
        testID="active-stream-banner-float"
        className="items-center left-4"
        style={{ position: getFloatingPosition(), bottom: bottomInset, right: rightInset }}
        pointerEvents="box-none"
        collapsable={false}
      >
        <Animated.View
          entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
        >
          <Pressable
            ref={bannerRef}
            className="flex-row items-center gap-2 rounded-lg px-3.5 py-2.5"
            style={[
              theme.tokens.elevation.overlay,
              {
                // Inverse surface, not `surface.sunken`: the text colours below
                // are `inverse*` tokens (Inverse-Pair Rule, DESIGN.md).
                backgroundColor: inverse.background,
              },
            ]}
            onPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel="Manage live stream"
          >
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: theme.tokens.status.live }}
            />
            <AppText
              variant="label"
              className="flex-1 font-semibold"
              style={{ color: inverse.foreground }}
              numberOfLines={1}
            >
              {activeStream.productName}
            </AppText>
            <AppText variant="data" style={[styles.elapsed, { color: inverse.muted }]}>
              {elapsed}
            </AppText>
          </Pressable>
        </Animated.View>
      </View>

      <StreamingSheet visible={sheetVisible} onDismiss={closeSheet} session={activeStream} />
    </>
  );
}

const styles = StyleSheet.create({
  // NOTE: no local shadow; `tokens.elevation.overlay` is applied inline (One Tier Rule).
  elapsed: {
    // NOTE: caption size on the `data` face (mono, tabular figures); no mono-13 step exists.
    fontSize: 13,
  },
});
