import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { IconButton } from '@/components/base/IconButton';
import { OverlaySurface } from '@/components/base/OverlaySurface';
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
        className="absolute inset-0"
        style={{ backgroundColor: theme.tokens.overlay.scrim }}
        onPress={onDismiss}
      />

      <View
        testID="streaming-sheet"
        className="bottom-0 left-0 right-0 max-h-[60%] overflow-hidden rounded-t-xl pt-2"
        style={[
          styles.sheet,
          theme.tokens.elevation.overlay,
          { backgroundColor: theme.colors.elevation.level4 },
        ]}
      >
        <View className="flex-row items-center justify-center">
          <OverlaySurface className="h-1 w-10 rounded-xs" tone="glass" />
          <IconButton
            icon="close"
            size={20}
            onPress={onDismiss}
            style={styles.closeButton}
            accessibilityLabel="Close"
          />
        </View>

        <AppText variant="title" className="mb-1 px-4 opacity-60">
          {session.cameraName}
        </AppText>

        <ScrollView contentContainerClassName="pb-2">
          <StreamingContent session={session} onStop={onDismiss} showProductLink />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: getFloatingPosition(),
    paddingBottom: Platform.OS === 'ios' ? 32 : 16, // clears the iOS home indicator
  },
  closeButton: {
    position: 'absolute',
    right: 4,
    top: -4,
  },
});
