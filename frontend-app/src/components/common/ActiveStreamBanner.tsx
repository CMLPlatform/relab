import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/base/Text';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useStopYouTubeStreamMutation } from '@/hooks/useRpiCameras';

function useElapsed(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

export function ActiveStreamBanner() {
  const { activeStream, setActiveStream } = useStreamSession();
  const router = useRouter();
  const elapsed = useElapsed(activeStream?.startedAt ?? null);

  // stopMutation needs a cameraId — create it with a stable placeholder and
  // use the ref trick to avoid re-creating when cameraId changes between renders.
  const cameraIdRef = useRef(activeStream?.cameraId ?? '');
  if (activeStream?.cameraId) cameraIdRef.current = activeStream.cameraId;
  const stopMutation = useStopYouTubeStreamMutation(cameraIdRef.current);

  if (!activeStream) return null;

  const handleStop = () => {
    Alert.alert(
      'End live stream?',
      `This will stop the broadcast for ${activeStream.productName} and save the recording.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Stream',
          style: 'destructive',
          onPress: () =>
            stopMutation.mutate(undefined, {
              onSuccess: () => setActiveStream(null),
              onError: (err) => alert(`Failed to stop stream: ${String(err)}`),
            }),
        },
      ],
    );
  };

  const handleTap = () => {
    router.push({ pathname: '/cameras/[id]', params: { id: activeStream.cameraId } });
  };

  return (
    <View
      style={[styles.container, { bottom: Platform.OS === 'web' ? 16 : 88 }]}
      pointerEvents="box-none"
    >
      <Pressable style={styles.banner} onPress={handleTap} accessibilityRole="button">
        <View style={styles.liveDot} />
        <Text style={styles.label} numberOfLines={1}>
          {activeStream.productName}
        </Text>
        <Text style={styles.elapsed}>{elapsed}</Text>
        <Pressable
          style={styles.stopBtn}
          onPress={handleStop}
          accessibilityRole="button"
          accessibilityLabel="End stream"
          hitSlop={8}
        >
          <Text style={styles.stopText}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
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
  stopBtn: {
    paddingHorizontal: 4,
  },
  stopText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
});
