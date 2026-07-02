import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useStreamSession } from '@/context/streamSession';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import type { CameraReadWithStatus, YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { startYouTubeStreamFlow } from './streamFlow';

type CameraStreamPickerParams = {
  productId: number;
  productName: string;
  onDismiss: () => void;
};

type ConfigState = {
  camera: CameraReadWithStatus;
  title: string;
  privacy: YouTubePrivacyStatus;
};

export function useCameraStreamPicker({
  productId,
  productName,
  onDismiss,
}: CameraStreamPickerParams) {
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleCameraSelect = (camera: CameraReadWithStatus) => {
    setConfig({ camera, title: productName, privacy: 'private' });
  };

  const handleDismiss = () => {
    setConfig(null);
    onDismiss();
  };

  const handleBack = () => {
    setConfig(null);
  };

  const handleStartStream = async () => {
    if (!config) return;

    setIsStarting(true);
    try {
      const started = await startYouTubeStreamFlow({
        cameraId: config.camera.id,
        cameraName: config.camera.name,
        productId,
        productName,
        title: config.title,
        privacy: config.privacy,
        queryClient,
        setActiveStream,
        feedback,
      });
      if (started) handleDismiss();
    } finally {
      setIsStarting(false);
    }
  };

  return {
    state: {
      config,
      isStarting,
      isSelectingCamera: config === null,
    },
    actions: {
      handleCameraSelect,
      handleDismiss,
      handleBack,
      handleStartStream,
      setTitle: (value: string) =>
        setConfig((current) => (current ? { ...current, title: value } : current)),
      setPrivacy: (value: YouTubePrivacyStatus) =>
        setConfig((current) => (current ? { ...current, privacy: value } : current)),
    },
  };
}
