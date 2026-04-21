import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Portal, Surface, Text } from 'react-native-paper';
import type { StreamSession } from '@/context/streamSession';
import { getFloatingPosition, getStreamingSheetBottomPadding } from '@/utils/platformLayout';
import { StreamingContent } from './StreamingContent';

interface StreamingSheetProps {
  visible: boolean;
  onDismiss: () => void;
  session: StreamSession | null;
}

export function StreamingSheet({ visible, onDismiss, session }: StreamingSheetProps) {
  if (!(visible && session)) return null;

  return (
    <Portal>
      <Pressable style={styles.backdrop} onPress={onDismiss} />

      <Surface style={styles.sheet} elevation={4}>
        <View style={styles.headerRow}>
          <View style={styles.handle} />
          <IconButton
            icon="close"
            size={20}
            onPress={onDismiss}
            style={styles.closeButton}
            accessibilityLabel="Close"
          />
        </View>

        <Text variant="titleSmall" style={styles.cameraLabel}>
          {session.cameraName}
        </Text>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <StreamingContent session={session} onStop={onDismiss} showProductLink />
        </ScrollView>
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
    maxHeight: '60%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: getStreamingSheetBottomPadding(),
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
  },
  closeButton: {
    position: 'absolute',
    right: 4,
    top: -4,
  },
  cameraLabel: {
    opacity: 0.6,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  scrollContent: {
    paddingBottom: 8,
  },
});
