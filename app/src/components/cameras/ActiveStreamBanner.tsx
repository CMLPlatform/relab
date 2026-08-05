import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { radius } from '@/constants';
import { useStreamSession } from '@/context/streamSession';
import { useElapsed } from '@/hooks/useElapsed';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';
import { StreamingSheet } from './StreamingSheet';

// Clears the native tab bar; on web the banner floats just above the viewport edge.
const BOTTOM_INSET = Platform.OS === 'web' ? 16 : 88;

export function ActiveStreamBanner() {
  const theme = useAppTheme();
  const { activeStream } = useStreamSession();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const openSheet = useCallback(() => setSheetVisible(true), []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const bannerRef = useReturnFocus(sheetVisible);

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
      <View style={[styles.container, { bottom: BOTTOM_INSET }]} pointerEvents="box-none">
        <Pressable
          ref={bannerRef}
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
          <View style={[styles.liveDot, { backgroundColor: theme.tokens.status.live }]} />
          <Text style={[styles.label, { color: theme.colors.inverseOnSurface }]} numberOfLines={1}>
            {activeStream.productName}
          </Text>
          <Text style={[styles.elapsed, { color: theme.tokens.text.inverseMuted }]}>{elapsed}</Text>
        </Pressable>
      </View>

      <StreamingSheet visible={sheetVisible} onDismiss={closeSheet} session={activeStream} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: getFloatingPosition(),
    left: 16,
    right: 16,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.card,
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
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  elapsed: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
