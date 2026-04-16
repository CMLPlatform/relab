import { Button, Dialog, Portal } from 'react-native-paper';
import { CameraPickerDialog } from '@/components/cameras/CameraPickerDialog';
import { LivePreview } from '@/components/cameras/LivePreview';
import { galleryStyles } from '@/components/product/gallery/styles';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

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
          style={galleryStyles.previewDialog}
        >
          <Dialog.Title>{previewCamera?.name ?? 'Camera preview'}</Dialog.Title>
          <Dialog.Content style={galleryStyles.previewDialogContent}>
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
