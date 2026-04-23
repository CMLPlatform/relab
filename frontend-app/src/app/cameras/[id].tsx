import {
  CameraConnectionCard,
  CameraPreviewSection,
} from '@/components/cameras/detail/ConnectionPreview';
import { CameraDetailDialogs } from '@/components/cameras/detail/Dialogs';
import {
  CameraDangerZone,
  CameraDetailsCard,
  CameraStreamingSection,
} from '@/components/cameras/detail/StreamingDetails';
import {
  CameraDetailErrorState,
  CameraDetailLayout,
  CameraDetailLoadingState,
} from '@/components/cameras/detail/shared';
import { useCameraDetailScreen } from '@/hooks/cameras/useCameraDetailScreen';

function CameraDetailContent({
  screen,
  preview,
  dialogs,
  actions,
}: ReturnType<typeof useCameraDetailScreen>) {
  const camera = screen.camera;
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
          onEditName={actions.openEditName}
          onEditDescription={actions.openEditDescription}
        />

        <CameraDangerZone onDelete={actions.requestDelete} />
      </CameraDetailLayout>

      <CameraDetailDialogs
        camera={camera}
        editNameVisible={dialogs.editNameVisible}
        editDescriptionVisible={dialogs.editDescriptionVisible}
        deleteVisible={dialogs.deleteVisible}
        localSetupVisible={dialogs.localSetupVisible}
        localUrlInput={dialogs.localUrlInput}
        localKeyInput={dialogs.localKeyInput}
        updateLoading={dialogs.updateLoading}
        deleteLoading={dialogs.deleteLoading}
        localSetupSaving={dialogs.localSetupSaving}
        onDismissEditName={actions.closeEditName}
        onDismissEditDescription={actions.closeEditDescription}
        onDismissDelete={actions.closeDelete}
        onDismissLocalSetup={actions.closeManualSetup}
        onSaveName={actions.saveName}
        onSaveDescription={actions.saveDescription}
        onDeleteCamera={actions.deleteCamera}
        onChangeLocalUrl={actions.setLocalUrl}
        onChangeLocalKey={actions.setLocalKey}
        onConnectLocal={actions.connectLocal}
      />
    </>
  );
}

export default function CameraDetailScreen() {
  const { screen, preview, dialogs, actions } = useCameraDetailScreen();

  if (!screen.user) return null;
  if (screen.isLoading) return <CameraDetailLoadingState />;

  if (screen.isError || !screen.camera) {
    return (
      <CameraDetailErrorState
        message={String(screen.error) || 'Camera not found.'}
        onRetry={actions.refresh}
      />
    );
  }

  return (
    <CameraDetailContent screen={screen} preview={preview} dialogs={dialogs} actions={actions} />
  );
}
