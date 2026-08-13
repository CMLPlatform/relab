import { usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { useStreamSession } from '@/context/streamSession';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useElapsed } from '@/hooks/useElapsed';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';
import { StreamingSheet } from './StreamingSheet';

// Clears the native tab bar (native's default already assumed one); on web the
// banner floats just above the viewport edge. Bumped by BOTTOM_NAV_CLEARANCE
// below whenever BottomNav is actually rendering (useBottomNavVisible), since
// on a phone-width web viewport there was previously no bar to account for.
// Web-only: on native BottomNav renders in normal flow and already shrinks
// the container the banner sits in, so adding clearance there would double it.
//
// NOTE (native trace, kept 88): the only floating chrome the banner ever needs
// to clear on native is a Fab (list screens' "New product"/"New camera" FABs
// and the detail screens' PrimaryProductFab — SaveBar only renders on web).
// Every Fab is MIN_TAP_TARGET (44) tall and docks at bottom:16 (list) or
// margin:19 (detail), so its top edge sits ~60-63px up from the screen edge;
// 88 clears that with a ~25-28px visual gap. Routes with no Fab (cameras
// detail/add, account, users/[username], category-selection, the *_/new
// creation screens) render the banner ~72px higher than strictly necessary
// there, but that's a cosmetic gap, not an overlap — splitting the inset by
// route would need the same route-detection machinery as
// SAVE_BAR_DOCK_RESERVE below for a purely visual gain. Left as one constant;
// revisit only if a route grows a Fab-adjacent element the 88 stops clearing.
const BASE_BOTTOM_INSET = Platform.OS === 'web' ? 16 : 88;

// SaveBar (FabControls.tsx) docks fixed at right:24/bottom:24 on >=md web
// product/component detail routes ('/products/:id' and '/components/:id'
// exactly — not '/products/new' or '.../components/new', which use a
// different screen with no SaveBar). The banner can't cheaply read SaveBar's
// own edit/dirty/validation state, so it reserves the zone whenever the
// route+breakpoint combination *could* render it — the same isMd gate
// ProductFabControls itself uses. The reserve width is a conservative
// estimate of SaveBar's widest realistic content (an error-summary button
// plus the primary Save/Edit button, with the dock's own padding and gaps),
// not a measured value — it only needs to be comfortably wider than SaveBar
// ever gets, not pixel-exact.
const SAVE_BAR_DOCK_ROUTE = /^\/(products|components)\/[^/]+$/;
// Not exported: this file is component-only for Fast Refresh
// (react-refresh/only-export-components), unlike useBottomNav.ts's
// intentionally-non-.tsx module. The test below duplicates this value.
const SAVE_BAR_DOCK_RESERVE = 400;

export function ActiveStreamBanner() {
  const theme = useAppTheme();
  const { activeStream } = useStreamSession();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const openSheet = useCallback(() => setSheetVisible(true), []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const bannerRef = useReturnFocus(sheetVisible);
  const bottomNavVisible = useBottomNavVisible();
  const bottomInset =
    Platform.OS === 'web' && bottomNavVisible
      ? BASE_BOTTOM_INSET + BOTTOM_NAV_CLEARANCE
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
      >
        <Pressable
          ref={bannerRef}
          className="flex-row items-center gap-2 rounded-lg px-3.5 py-2.5"
          style={[
            styles.banner,
            {
              backgroundColor: theme.tokens.surface.sunken,
              ...(Platform.OS === 'web'
                ? { boxShadow: `0px 0px 8px ${theme.tokens.status.live}` }
                : { shadowColor: theme.tokens.status.live }),
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
            style={[styles.label, { color: theme.colors.inverseOnSurface }]}
            numberOfLines={1}
          >
            {activeStream.productName}
          </AppText>
          <AppText
            variant="data"
            style={[styles.elapsed, { color: theme.tokens.text.inverseMuted }]}
          >
            {elapsed}
          </AppText>
        </Pressable>
      </View>

      <StreamingSheet visible={sheetVisible} onDismiss={closeSheet} session={activeStream} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    // subtle red glow via shadow
    ...(Platform.OS === 'web'
      ? {}
      : {
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 8,
        }),
    elevation: 8,
  },
  label: {
    // fontSize 13 has no exact Tailwind step, so it stays inline.
    fontSize: 13,
  },
  elapsed: {
    // The `data` variant supplies the mono family and tabular figures; only the
    // smaller banner size is pinned here.
    fontSize: 12,
  },
});
