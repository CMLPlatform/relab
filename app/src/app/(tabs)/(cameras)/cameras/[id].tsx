import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useRef } from 'react';
import type { View } from 'react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { ErrorState } from '@/components/base/ErrorState';
import { PageHeaderRow } from '@/components/base/PageHeaderRow';
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
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getErrorMessage } from '@/utils/errors';

function CameraDetailContent({
  screen,
  preview,
  dialogs,
  actions,
}: ReturnType<typeof useCameraDetailScreen>) {
  const camera = screen.camera;
  const router = useRouter();
  const { isLg } = useBreakpoint();
  // Same target as the stack header back in (cameras)/_layout.tsx.
  const goToCameras = useCallback(() => router.replace('/cameras'), [router]);
  const deleteTriggerRef = useRef<View>(null);
  const manualSetupTriggerRef = useRef<View>(null);
  const onEditName = useCallback(
    () => actions.promptRename(screen.renameTriggerRef),
    [actions, screen.renameTriggerRef],
  );
  const onEditDescription = useCallback(
    () => actions.promptEditDescription(screen.descriptionTriggerRef),
    [actions, screen.descriptionTriggerRef],
  );
  if (!camera) return null;

  return (
    <>
      <Head>
        <title>{`${camera.name || 'Camera'} · Relab`}</title>
      </Head>
      <CameraDetailLayout>
        {isLg ? <PageHeaderRow title={camera.name || 'Camera'} onBack={goToCameras} /> : null}
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
          onEditName={onEditName}
          onEditDescription={onEditDescription}
          nameTriggerRef={screen.renameTriggerRef}
          descriptionTriggerRef={screen.descriptionTriggerRef}
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

  // Only hit for the one-render window before useRequireAuth's redirect completes.
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
