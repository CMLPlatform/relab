import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { useStreamSession } from '@/context/streamSession';
import { useElapsed } from '@/hooks/useElapsed';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';
import { StreamingSheet } from './StreamingSheet';

// Clears the native tab bar (native's default already assumed one); on web the
// banner floats just above the viewport edge. Bumped by BOTTOM_NAV_CLEARANCE
// below whenever BottomNav is actually rendering (useBottomNavVisible), since
// on a phone-width web viewport there was previously no bar to account for.
const BASE_BOTTOM_INSET = Platform.OS === 'web' ? 16 : 88;

export function ActiveStreamBanner() {
  const theme = useAppTheme();
  const { activeStream } = useStreamSession();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const openSheet = useCallback(() => setSheetVisible(true), []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const bannerRef = useReturnFocus(sheetVisible);
  const bottomNavVisible = useBottomNavVisible();
  const bottomInset = bottomNavVisible
    ? BASE_BOTTOM_INSET + BOTTOM_NAV_CLEARANCE
    : BASE_BOTTOM_INSET;

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
        className="items-center left-4 right-4"
        style={{ position: getFloatingPosition(), bottom: bottomInset }}
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
