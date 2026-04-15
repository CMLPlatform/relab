import {
  CameraSelectionStep,
  CameraStreamConfigDialog,
} from '@/components/cameras/CameraStreamPickerSections';
import { useCameraStreamPicker } from '@/hooks/useCameraStreamPicker';

interface CameraStreamPickerProps {
  productId: number;
  productName: string;
  visible: boolean;
  onDismiss: () => void;
}

export function CameraStreamPicker({
  productId,
  productName,
  visible,
  onDismiss,
}: CameraStreamPickerProps) {
  const { state, actions } = useCameraStreamPicker({
    productId,
    productName,
    onDismiss,
  });

  return (
    <>
      <CameraSelectionStep
        visible={visible && state.isSelectingCamera}
        onDismiss={actions.handleDismiss}
        onSelect={actions.handleCameraSelect}
      />
      <CameraStreamConfigDialog
        config={state.config}
        loading={state.isStarting}
        onBack={actions.handleBack}
        onDismiss={actions.handleBack}
        onChangeTitle={actions.setTitle}
        onChangePrivacy={actions.setPrivacy}
        onStart={() => {
          void actions.handleStartStream();
        }}
      />
    </>
  );
}
