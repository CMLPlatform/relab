import {
  CamerasErrorState,
  CamerasFab,
  CamerasGrid,
  CamerasLoadingState,
  CamerasSelectionOverlay,
  CamerasSnackbar,
  CamerasStreamDialog,
} from '@/components/cameras/CamerasScreenSections';
import { useCamerasScreen } from '@/hooks/useCamerasScreen';

export default function CamerasScreen() {
  const { screen, selection, streaming, actions } = useCamerasScreen();

  if (!screen.user) return null;
  if (screen.isLoading) return <CamerasLoadingState />;
  if (screen.isError) {
    return (
      <CamerasErrorState
        message={String(screen.error) || 'Failed to load cameras.'}
        onRetry={() => screen.refetch()}
      />
    );
  }

  return (
    <>
      <CamerasSelectionOverlay
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
        onRefresh={() => screen.refetch()}
        onCardPress={actions.handleCardTap}
        onCardLongPress={actions.handleCardLongPress}
        onEffectiveConnectionChange={actions.handleEffectiveConnectionChange}
      />

      <CamerasFab visible={!screen.streamModeEnabled} onPress={actions.openAddCamera} />

      <CamerasSnackbar message={streaming.snackbarMessage} onDismiss={streaming.dismissSnackbar} />

      <CamerasStreamDialog
        state={streaming.streamDialog}
        loading={streaming.isStartingStream}
        onDismiss={streaming.closeStreamDialog}
        onChangeTitle={streaming.setStreamTitle}
        onChangePrivacy={streaming.setStreamPrivacy}
        onStart={() => {
          void streaming.handleStartStream();
        }}
      />
    </>
  );
}
