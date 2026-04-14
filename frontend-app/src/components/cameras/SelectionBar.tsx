import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';

/**
 * Sticky top bar shown while the mosaic is in multi-select mode.
 *
 * Users arrive here by long-pressing a card (native) or tapping a dedicated
 * "Select" button (web). The bar lets them fire the Capture N action across
 * the selected cameras, select all online cameras at once, or clear the
 * selection and return to normal navigation mode.
 */
export function SelectionBar({
  selectedCount,
  onlineCount,
  onSelectAll,
  onClear,
  onCaptureAll,
  isCapturing,
}: {
  selectedCount: number;
  onlineCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onCaptureAll: () => void;
  isCapturing: boolean;
}) {
  const canCapture = selectedCount > 0 && !isCapturing;
  return (
    <View style={styles.bar}>
      <IconButton icon="close" onPress={onClear} accessibilityLabel="Clear selection" />
      <Text variant="titleMedium" style={styles.label}>
        {selectedCount} selected
      </Text>
      <View style={styles.spacer} />
      <Button
        mode="text"
        onPress={onSelectAll}
        disabled={onlineCount === 0 || selectedCount === onlineCount}
        accessibilityLabel="Select all online cameras"
      >
        Select all ({onlineCount})
      </Button>
      <Button
        mode="contained"
        icon="camera-burst"
        onPress={onCaptureAll}
        loading={isCapturing}
        disabled={!canCapture}
      >
        {isCapturing ? 'Capturing…' : `Capture ${selectedCount}`}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  label: {
    marginLeft: 4,
  },
  spacer: {
    flex: 1,
  },
});
