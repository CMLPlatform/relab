import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  showGoogleAccountRequired,
  showStreamStartFailed,
} from '@/components/cameras/streamingFeedback';
import { useStreamSession } from '@/context/streamSession';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { addProductVideo } from '@/services/api/products';
import type { CameraReadWithStatus, YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { startYouTubeStream } from '@/services/api/rpiCamera';

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
      const result = await startYouTubeStream(config.camera.id, {
        product_id: productId,
        title: config.title.trim() || undefined,
        privacy_status: config.privacy,
      });
      setActiveStream({
        cameraId: config.camera.id,
        cameraName: config.camera.name,
        productId,
        productName,
        startedAt: result.started_at,
        youtubeUrl: result.url,
      });
      addProductVideo(productId, {
        url: result.url,
        title: config.title.trim() || 'Live stream',
        description: '',
      }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['product', productId] });
      handleDismiss();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'GOOGLE_OAUTH_REQUIRED') {
        showGoogleAccountRequired(feedback);
      } else {
        showStreamStartFailed(feedback, error);
      }
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
