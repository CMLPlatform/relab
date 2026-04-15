import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useElapsed } from '@/hooks/useElapsed';
import { StreamingSheet } from './StreamingSheet';

export function ActiveStreamBanner() {
  const { activeStream } = useStreamSession();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);
  const [sheetVisible, setSheetVisible] = useState(false);

  if (!activeStream) return null;

  return (
    <>
      <View
        style={[styles.container, { bottom: Platform.OS === 'web' ? 16 : 88 }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.banner}
          onPress={() => setSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Manage live stream"
        >
          <View style={styles.liveDot} />
          <Text style={styles.label} numberOfLines={1}>
            {activeStream.productName}
          </Text>
          <Text style={styles.elapsed}>{elapsed}</Text>
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
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
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
    backgroundColor: '#1a1a1a',
    // subtle red glow via shadow
    shadowColor: '#e53935',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  label: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  elapsed: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
