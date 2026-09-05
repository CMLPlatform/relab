import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { FeedbackApi } from '@/components/cameras/streamingFeedback';
import { useStreamSession } from '@/context/streamSession';
import type { StreamDialogState } from '@/features/cameras/state';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { startYouTubeStreamFlow } from './streamFlow';

export function useCameraStreamActions({
  streamModeEnabled,
  selectionMode,
  isCameraReachable,
  openStreamDialog,
  streamProductName,
  toggleSelected,
  streamDialog,
  streamProductId,
  streamProductNameForSession,
  closeStreamDialog,
  setIsStartingStream,
  feedback,
}: {
  streamModeEnabled: boolean;
  selectionMode: boolean;
  isCameraReachable: (camera: CameraReadWithStatus) => boolean;
  openStreamDialog: (cameraId: string, cameraName: string, defaultTitle: string) => void;
  streamProductName: string;
  toggleSelected: (cameraId: string) => void;
  streamDialog: StreamDialogState;
  streamProductId: number | null;
  streamProductNameForSession?: string;
  closeStreamDialog: () => void;
  setIsStartingStream: (value: boolean) => void;
  feedback: FeedbackApi;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setActiveStream } = useStreamSession();

  const handleCardTap = useCallback(
    (camera: CameraReadWithStatus) => {
      if (streamModeEnabled) {
        if (!isCameraReachable(camera)) {
          feedback.toast(`${camera.name} is offline — can't stream.`);
          return;
        }
        openStreamDialog(camera.id, camera.name, streamProductName);
        return;
      }

      if (selectionMode) {
        if (isCameraReachable(camera)) {
          toggleSelected(camera.id);
        } else {
          feedback.toast(`${camera.name} is offline — can't capture.`);
        }
        return;
      }

      router.push({ pathname: '/cameras/[id]', params: { id: camera.id } });
    },
    [
      feedback,
      isCameraReachable,
      openStreamDialog,
      router,
      selectionMode,
      streamModeEnabled,
      streamProductName,
      toggleSelected,
    ],
  );

  const handleStartStream = useCallback(async () => {
    if (!streamDialog.cameraId || streamProductId === null) return;
    setIsStartingStream(true);
    try {
      const started = await startYouTubeStreamFlow({
        cameraId: streamDialog.cameraId,
        cameraName: streamDialog.cameraName,
        productId: streamProductId,
        productName:
          streamProductNameForSession ?? (streamDialog.title || `Product ${streamProductId}`),
        title: streamDialog.title,
        privacy: streamDialog.privacy,
        queryClient,
        setActiveStream,
        feedback,
      });
      if (started) {
        closeStreamDialog();
        // The toast is rendered above the navigator, so it outlives this
        // screen's pop — no delay needed before navigating back.
        feedback.toast(`Now live: ${streamDialog.cameraName}`);
        router.back();
      }
    } finally {
      setIsStartingStream(false);
    }
  }, [
    closeStreamDialog,
    feedback,
    queryClient,
    router,
    setActiveStream,
    setIsStartingStream,
    streamDialog,
    streamProductId,
    streamProductNameForSession,
  ]);

  return { handleCardTap, handleStartStream };
}
