import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { IconButton } from '@/components/base/IconButton';
import { OverlaySurface } from '@/components/base/OverlaySurface';
import { radius } from '@/constants';
import type { StreamSession } from '@/context/streamSession';
import { useAppTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';
import { StreamingContent } from './StreamingContent';

interface StreamingSheetProps {
  visible: boolean;
  onDismiss: () => void;
  session: StreamSession | null;
}

export function StreamingSheet({ visible, onDismiss, session }: StreamingSheetProps) {
  const theme = useAppTheme();
  if (!(visible && session)) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.tokens.overlay.scrim }]}
        onPress={onDismiss}
      />

      <View
        testID="streaming-sheet"
        style={[
          styles.sheet,
          theme.tokens.elevation.overlay,
          { backgroundColor: theme.colors.elevation.level4 },
        ]}
      >
        <View style={styles.headerRow}>
          <OverlaySurface style={styles.handle} tone="glass" />
          <IconButton
            icon="close"
            size={20}
            onPress={onDismiss}
            style={styles.closeButton}
            accessibilityLabel="Close"
          />
        </View>

        <AppText variant="title" style={styles.cameraLabel}>
          {session.cameraName}
        </AppText>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <StreamingContent session={session} onStop={onDismiss} showProductLink />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    position: getFloatingPosition(),
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    borderTopLeftRadius: radius.overlay,
    borderTopRightRadius: radius.overlay,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16, // clears the iOS home indicator
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
