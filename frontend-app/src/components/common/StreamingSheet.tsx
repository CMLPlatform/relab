import { Pressable, StyleSheet, View } from 'react-native';
import { Portal, Surface, Text } from 'react-native-paper';
import type { StreamSession } from '@/context/StreamSessionContext';
import { getFloatingPosition, getStreamingSheetBottomPadding } from '@/utils/platformLayout';
import { StreamingContent } from './StreamingContent';

interface StreamingSheetProps {
  visible: boolean;
  onDismiss: () => void;
  session: StreamSession | null;
}

export function StreamingSheet({ visible, onDismiss, session }: StreamingSheetProps) {
  if (!visible || !session) return null;

  return (
    <Portal>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onDismiss} />

      {/* Sheet */}
      <Surface style={styles.sheet} elevation={4}>
        {/* Drag handle */}
        <View style={styles.handle} />

        <Text variant="titleSmall" style={styles.cameraLabel}>
          {session.cameraName}
        </Text>

        <StreamingContent session={session} onStop={onDismiss} showProductLink />
      </Surface>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: getFloatingPosition(),
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: getStreamingSheetBottomPadding(),
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  cameraLabel: {
    opacity: 0.6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
});
