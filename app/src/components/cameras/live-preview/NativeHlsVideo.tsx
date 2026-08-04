import { useVideoPlayer, VideoView } from 'expo-video';
import { View } from 'react-native';
import { useAuthedMediaSource } from '@/services/api/authedMedia';
import { useAppTheme } from '@/theme';
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
  const source = authenticated ? authedSource : { uri: src };
  // NOTE: useVideoPlayer releases the player on unmount; releasing it again
  // here would double-release the underlying native shared object.
  const player = useVideoPlayer(source, (instance) => {
    instance.muted = true;
    instance.loop = false;
    instance.play();
  });

  return (
    <View style={styles.videoFrame}>
      <VideoView
        player={player}
        style={styles.nativeVideo}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}
