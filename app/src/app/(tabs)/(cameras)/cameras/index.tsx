import { useCallback, useRef } from 'react';
import type { View } from 'react-native';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { ErrorState } from '@/components/base/ErrorState';
import { PageContainer } from '@/components/base/PageContainer';
import { GoLiveDialog } from '@/components/cameras/GoLiveDialog';
import { SelectionBar } from '@/components/cameras/SelectionBar';
import { CamerasFab } from '@/components/cameras/screen/Chrome';
import { CamerasGrid } from '@/components/cameras/screen/Grid';
import { useCamerasScreen } from '@/features/cameras/useCamerasScreen';
import { getErrorMessage } from '@/utils/errors';

export default function CamerasScreen() {
  const { screen, selection, streaming, actions } = useCamerasScreen();
  const { refetch } = screen;
  const handleStartStream = async () => streaming.handleStartStream();
  const handleRetry = useCallback(() => refetch(), [refetch]);
  const streamTriggerRef = useRef<View>(null);

  // useCamerasScreen's useRequireAuth('/cameras') fires the redirect; AuthProvider
  // already blocks rendering until the initial auth check resolves, so this can
  // only be hit for the one-render window before that redirect completes.
  if (!screen.user) return <CenteredSpinner />;
  if (screen.isLoading) return <CenteredSpinner />;
  if (screen.isError) {
    return (
      <ErrorState
        message={getErrorMessage(screen.error, "Couldn't load cameras.")}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <>
      <PageContainer phoneFullBleed>
        <SelectionBar
          visible={selection.selectionMode}
          selectedCount={selection.selectedCount}
          onlineCount={screen.onlineCount}
          onSelectAll={selection.handleSelectAll}
          onClear={selection.clearSelection}
          onCaptureAll={selection.handleCaptureSelected}
          isCapturing={selection.captureAllPending}
        />

        <CamerasGrid
          rows={screen.rows}
          numColumns={screen.numColumns}
          selectedIds={selection.selectedIds}
          isFetching={screen.isFetching}
          onRefresh={handleRetry}
          onCardPress={actions.handleCardTap}
          onCardLongPress={actions.handleCardLongPress}
          // Multi-select is a long-press, which nothing on a card advertises.
          hint={
            screen.captureModeEnabled && !selection.selectionMode
              ? 'Press and hold a camera to select the ones to capture from.'
              : undefined
          }
          onEffectiveConnectionChange={actions.handleEffectiveConnectionChange}
          streamTriggerRef={streamTriggerRef}
        />
      </PageContainer>

      <CamerasFab visible={!screen.streamModeEnabled} onPress={actions.openAddCamera} />

      <GoLiveDialog
        visible={streaming.streamDialog.cameraId !== null}
        cameraName={streaming.streamDialog.cameraName}
        title={streaming.streamDialog.title}
        privacy={streaming.streamDialog.privacy}
        loading={streaming.isStartingStream}
        onDismiss={streaming.closeStreamDialog}
        onChangeTitle={streaming.setStreamTitle}
        onChangePrivacy={streaming.setStreamPrivacy}
        onStart={handleStartStream}
        secondaryLabel="Cancel"
        onSecondary={streaming.closeStreamDialog}
        triggerRef={streamTriggerRef}
      />
    </>
  );
}
