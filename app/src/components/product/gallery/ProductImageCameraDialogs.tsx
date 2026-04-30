import { Button, Dialog, Portal } from 'react-native-paper';
import { CameraPickerDialog } from '@/components/cameras/CameraPickerDialog';
import { LivePreview } from '@/components/cameras/LivePreview';
import { createGalleryStyles } from '@/components/product/gallery/styles';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

type Props = {
  cameraPickerVisible: boolean;
  previewCamera: CameraReadWithStatus | null;
  isCapturing: boolean;
  onDismissCameraPicker: () => void;
  onSelectCamera: (camera: CameraReadWithStatus) => void;
  onDismissPreview: () => void;
  onCapturePreview: () => void;
};

export function ProductImageCameraDialogs({
  cameraPickerVisible,
  previewCamera,
  isCapturing,
  onDismissCameraPicker,
  onSelectCamera,
  onDismissPreview,
  onCapturePreview,
}: Props) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <>
      <CameraPickerDialog
        visible={cameraPickerVisible}
        onDismiss={onDismissCameraPicker}
        onSelect={onSelectCamera}
      />

      <Portal>
        <Dialog
          visible={previewCamera !== null}
          onDismiss={onDismissPreview}
          style={styles.previewDialog}
        >
          <Dialog.Title>{previewCamera?.name ?? 'Camera preview'}</Dialog.Title>
          <Dialog.Content style={styles.previewDialogContent}>
            <LivePreview camera={previewCamera} enabled={previewCamera !== null} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={onDismissPreview}>Cancel</Button>
            <Button
              mode="contained"
              disabled={isCapturing}
              loading={isCapturing}
              onPress={onCapturePreview}
            >
              Capture
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
