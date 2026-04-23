import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { useStreamSession } from '@/context/streamSession';
import { useElapsed } from '@/hooks/useElapsed';
import { useAppTheme } from '@/theme';
import { getActiveStreamBannerBottomInset, getFloatingPosition } from '@/utils/platformLayout';
import { StreamingSheet } from './StreamingSheet';

export function ActiveStreamBanner() {
  const theme = useAppTheme();
  const { activeStream } = useStreamSession();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);
  const [sheetVisible, setSheetVisible] = useState(false);

  if (!activeStream) return null;

  return (
    <>
      <View
        style={[styles.container, { bottom: getActiveStreamBannerBottomInset() }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={[
            styles.banner,
            {
              backgroundColor: theme.tokens.surface.sunken,
              ...(Platform.OS === 'web'
                ? { boxShadow: `0px 0px 8px ${theme.tokens.status.live}` }
                : { shadowColor: theme.tokens.status.live }),
            },
          ]}
          onPress={() => setSheetVisible(true)}
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

      <StreamingSheet
        visible={sheetVisible}
        onDismiss={() => setSheetVisible(false)}
        session={activeStream}
      />
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
    borderRadius: 24,
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
