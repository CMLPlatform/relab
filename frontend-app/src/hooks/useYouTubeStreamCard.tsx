import { Linking } from 'react-native';
import { showStreamStopFailed } from '@/components/cameras/streamingFeedback';
import { useStreamSession } from '@/context/streamSession';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useElapsed } from '@/hooks/useElapsed';
import { useStopYouTubeStreamMutation, useStreamStatusQuery } from '@/hooks/useRpiCameras';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';

export function useYouTubeStreamCard(cameraId: string, isOnline: boolean) {
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();
  const { data: streamStatus, isLoading: statusLoading } = useStreamStatusQuery(cameraId, {
    enabled: isOnline && youtubeEnabled,
  });
  const stopMutation = useStopYouTubeStreamMutation(cameraId);
  const elapsed = useElapsed(streamStatus?.started_at ?? null);

  const handleWatch = () => {
    if (!streamStatus?.url) return;
    void Linking.openURL(streamStatus.url);
  };

  const handleStop = () => {
    feedback.alert({
      title: 'End live stream?',
      message: 'This will stop the broadcast and save the recording.',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'End Stream',
          onPress: () =>
            stopMutation.mutate(undefined, {
              onSuccess: () => setActiveStream(null),
              onError: (error) => showStreamStopFailed(feedback, error),
            }),
        },
      ],
    });
  };

  return {
    state: {
      youtubeEnabled,
      streamStatus,
      statusLoading,
      isLive: !!streamStatus,
      isStopping: stopMutation.isPending,
      elapsed,
    },
    actions: {
      handleWatch,
      handleStop,
    },
  };
}
