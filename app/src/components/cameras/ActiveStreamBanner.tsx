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
//
// NOTE (native trace, kept 88): the only floating chrome the banner ever needs
// to clear on native is a Fab (list screens' "New product"/"New camera" FABs
// and the detail screens' PrimaryProductFab — SaveBar only renders on web).
// Every Fab is MIN_TAP_TARGET (44) tall and docks 16px from the bottom of the
// screen it lives in (list and detail now share the same offset), so its top
// edge sits ~60px above that edge; 88 clears that with a ~28px visual gap. Routes
// with no Fab (cameras detail/add, account, users/[username],
// category-selection, the *_/new creation screens) render the banner ~72px
// higher than strictly necessary there, but that's a cosmetic gap, not an
// overlap — splitting the inset by route would need the same route-detection
// machinery as SAVE_BAR_DOCK_RESERVE below for a purely visual gain. Left as
// one constant; revisit only if a route grows a Fab-adjacent element the 88
// stops clearing.
//
// That 88 measures from the *tab scene's* bottom, but this banner is mounted at
// the app root, OUTSIDE the tab navigator — the bar never shrinks the box it
// positions against, on native any more than on web. So whenever the bar is
// rendering (useBottomNavVisible below) the banner has to add the bar's full
// height back: BOTTOM_NAV_CLEARANCE plus the safe-area padding the bar puts
// under it (0 on web). Without the safe-area term a notched device would put
// the banner (88+60) straight through a detail screen's Fab, whose top edge is
// then at 63 + 60 + inset.
const BASE_BOTTOM_INSET = Platform.OS === 'web' ? 16 : 88;

// SaveBar (FabControls.tsx) docks fixed at right:24/bottom:24 on >=md web
// product/component detail routes ('/products/:id' and '/components/:id'
// exactly — not '/products/new' or '.../components/new', which use a
// different screen with no SaveBar). The (?!new$) exclusion matters: '/products/new'
// would otherwise match '/products/:id' too, since 'new' satisfies [^/]+. The
// banner can't cheaply read SaveBar's own edit/dirty/validation state, so it
// reserves the zone whenever the route+breakpoint combination *could* render
// it — the same isMd gate ProductFabControls itself uses. The reserve width
// is a conservative estimate of SaveBar's widest realistic content (an
// error-summary button plus the primary Save/Edit button, with the dock's
// own padding and gaps), not a measured value — it only needs to be
// comfortably wider than SaveBar ever gets, not pixel-exact.
// Known over-reservation: SaveBar itself also hides for a non-owner viewer
// (SaveBar.tsx: `if (!ownedByMe) return null`), which this route+breakpoint
// check can't see — read-only visitors on a detail route get the 400px
// reservation with nothing behind it to protect. Accepted trade-off, not
// wired: threading ownership into this globally-mounted banner is real
// architectural cost (fetching/propagating per-product ownership into chrome
// that doesn't otherwise know about products) for a purely cosmetic gain
// (an empty gap, not an overlap) on a visitor-viewing-someone-else's-product
// path. Revisit only if that path gets materially more common.
// SaveBar.tsx / FabControls.tsx carry a back-reference comment — keep both
// in sync if the route pattern or SaveBar's render condition changes.
const SAVE_BAR_DOCK_ROUTE = /^\/(products|components)\/(?!new$)[^/]+$/;
// Not exported: this file is component-only for Fast Refresh
// (react-refresh/only-export-components), unlike useBottomNav.ts's
// intentionally-non-.tsx module. The test below duplicates this value.
const SAVE_BAR_DOCK_RESERVE = 400;

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
  const bottomInset = bottomNavVisible
    ? BASE_BOTTOM_INSET + BOTTOM_NAV_CLEARANCE + insets.bottom
    : BASE_BOTTOM_INSET;
  const pathname = usePathname();
  const { isMd } = useBreakpoint();
  const saveBarDockActive = Platform.OS === 'web' && isMd && SAVE_BAR_DOCK_ROUTE.test(pathname);
  const rightInset = saveBarDockActive ? SAVE_BAR_DOCK_RESERVE : 16;

  // Reset the sheet whenever the active stream changes (ends elsewhere, or a new
  // one starts) so it never auto-reopens for a stream the user didn't tap into.
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
                // Inverse surface, not `surface.sunken`. `sunken` is same-polarity
                // (light grey in light, near-black in dark) while both text colours
                // below are `inverse*` tokens that assume an inverted backdrop —
                // the mismatch computed to 1.32:1 dark and 1.16:1 light, i.e. the
                // product name was invisible in both schemes. This is the same
                // inverse-chip recipe InfoTooltip, DialogProvider and FabControls
                // already use.
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
  // NOTE: no local shadow. The manila glow this used to paint broke two
  // DESIGN.md rules at once — the One Tier Rule (a second, coloured elevation
  // tier) and the Data-Label Rule (accent as mass rather than as a small label).
  // The live dot is the sanctioned manila usage; the banner takes the single
  // sanctioned `tokens.elevation.overlay` tier, applied inline like Fab does.
  elapsed: {
    // The `data` variant supplies the mono family and tabular figures; only the
    // smaller banner size is pinned here — stepped to the caption size (13)
    // rather than an arbitrary 12.
    fontSize: 13,
  },
});
