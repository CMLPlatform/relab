import { useRef } from 'react';
import type { View } from 'react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { ErrorState } from '@/components/base/ErrorState';
import {
  CameraConnectionCard,
  CameraPreviewSection,
} from '@/components/cameras/detail/ConnectionPreview';
import { CameraDetailDialogs } from '@/components/cameras/detail/Dialogs';
import { CameraDetailLayout } from '@/components/cameras/detail/detailRows';
import {
  CameraDangerZone,
  CameraDetailsCard,
  CameraStreamingSection,
} from '@/components/cameras/detail/StreamingDetails';
import { useCameraDetailScreen } from '@/features/cameras/useCameraDetailScreen';
import { getErrorMessage } from '@/utils/errors';

function CameraDetailContent({
  screen,
  preview,
  dialogs,
  actions,
}: ReturnType<typeof useCameraDetailScreen>) {
  const camera = screen.camera;
  const deleteTriggerRef = useRef<View>(null);
  const manualSetupTriggerRef = useRef<View>(null);
  if (!camera) return null;

  return (
    <>
      <CameraDetailLayout>
        <CameraConnectionCard
          camera={camera}
          effectiveConnection={screen.effectiveConnection}
          isFetching={screen.isFetching}
          onRefresh={actions.refresh}
          onOpenManualSetup={actions.openManualSetup}
          onDisconnectLocal={actions.disconnectLocal}
          manualSetupTriggerRef={manualSetupTriggerRef}
        />

        <CameraPreviewSection
          camera={camera}
          canPreview={screen.canPreview}
          previewEnabled={preview.enabled}
          onTogglePreview={actions.togglePreview}
          connectionInfo={screen.localConnection}
        />

        <CameraStreamingSection cameraId={camera.id} isOnline={screen.isOnline} />

        <CameraDetailsCard
          camera={camera}
          onEditName={actions.promptRename}
          onEditDescription={actions.promptEditDescription}
        />

        <CameraDangerZone onDelete={actions.requestDelete} deleteTriggerRef={deleteTriggerRef} />
      </CameraDetailLayout>

      <CameraDetailDialogs
        camera={camera}
        deleteVisible={dialogs.deleteVisible}
        localSetupVisible={dialogs.localSetupVisible}
        localUrlInput={dialogs.localUrlInput}
        localKeyInput={dialogs.localKeyInput}
        deleteLoading={dialogs.deleteLoading}
        localSetupSaving={dialogs.localSetupSaving}
        onDismissDelete={actions.closeDelete}
        onDismissLocalSetup={actions.closeManualSetup}
        onDeleteCamera={actions.deleteCamera}
        onChangeLocalUrl={actions.setLocalUrl}
        onChangeLocalKey={actions.setLocalKey}
        onConnectLocal={actions.connectLocal}
        deleteTriggerRef={deleteTriggerRef}
        manualSetupTriggerRef={manualSetupTriggerRef}
      />
    </>
  );
}

export default function CameraDetailScreen() {
  const { screen, preview, dialogs, actions } = useCameraDetailScreen();

  // useCameraDetailScreen's useRequireAuth('/cameras') fires the redirect; AuthProvider
  // already blocks rendering until the initial auth check resolves, so this can
  // only be hit for the one-render window before that redirect completes.
  if (!screen.user) return <CenteredSpinner />;
  if (screen.isLoading) return <CenteredSpinner />;

  if (screen.isError || !screen.camera) {
    return (
      <ErrorState
        message={getErrorMessage(screen.error, 'Camera not found.')}
        onRetry={actions.refresh}
      />
    );
  }

  return (
    <CameraDetailContent screen={screen} preview={preview} dialogs={dialogs} actions={actions} />
  );
}
