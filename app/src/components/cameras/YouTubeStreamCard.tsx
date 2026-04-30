import { YouTubeStreamCardView } from '@/components/cameras/YouTubeStreamCardSections';
import { useYouTubeStreamCard } from '@/hooks/useYouTubeStreamCard';

interface YouTubeStreamCardProps {
  cameraId: string;
  isOnline: boolean;
}

export function YouTubeStreamCard({ cameraId, isOnline }: YouTubeStreamCardProps) {
  const { state, actions } = useYouTubeStreamCard(cameraId, isOnline);

  if (!state.youtubeEnabled) return null;

  return (
    <YouTubeStreamCardView
      isLive={state.isLive}
      isLoading={state.statusLoading}
      elapsed={state.elapsed}
      streamStatus={state.streamStatus}
      isStopping={state.isStopping}
      onWatch={actions.handleWatch}
      onStop={actions.handleStop}
    />
  );
}
