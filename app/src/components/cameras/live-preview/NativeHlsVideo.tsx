import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useAuthedMediaSource } from '@/services/api/authedMedia';
import { useAppTheme } from '@/theme';
import { PreviewErrorOverlay, PreviewLoadingOverlay } from './previewOverlays';
import { createLivePreviewStyles } from './styles';

export function NativeHlsVideo({
  src,
  authenticated = true,
}: {
  src: string;
  authenticated?: boolean;
}) {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  // The relayed LL-HLS route is owner-checked (CurrentActiveUserDep), and native
  // carries a bearer token rather than the web session cookie, so the player has
  // to send it explicitly — the web path already does this via `withCredentials`.
  const authedSource = useAuthedMediaSource(authenticated ? src : null);
  const source = useMemo(
    () => (authenticated ? authedSource : { uri: src }),
    [authenticated, authedSource, src],
  );
  // NOTE: useVideoPlayer releases the player on unmount; releasing it again
  // here would double-release the underlying native shared object.
  const player = useVideoPlayer(source, (instance) => {
    instance.muted = true;
    instance.loop = false;
    instance.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const retry = useCallback(() => {
    // Playback stopped on error and replace alone doesn't restart it.
    // A failed retry re-enters 'error' via statusChange on its own.
    player.replaceAsync(source).then(
      () => player.play(),
      () => undefined,
    );
  }, [player, source]);

  return (
    <View className="relative aspect-[4/3] w-full">
      <VideoView
        player={player}
        style={styles.nativeVideo}
        contentFit="contain"
        nativeControls={false}
      />
      {status === 'loading' || status === 'idle' ? <PreviewLoadingOverlay /> : null}
      {status === 'error' ? (
        <PreviewErrorOverlay message="Couldn't load the preview" onRetry={retry} />
      ) : null}
    </View>
  );
}
