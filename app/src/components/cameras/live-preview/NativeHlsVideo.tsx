import { useVideoPlayer, VideoView } from 'expo-video';
import { View } from 'react-native';
import { useAppTheme } from '@/theme';
import { createLivePreviewStyles } from './styles';

export function NativeHlsVideo({ src }: { src: string }) {
  const theme = useAppTheme();
  const styles = createLivePreviewStyles(theme);
  // NOTE: useVideoPlayer releases the player on unmount; releasing it again
  // here would double-release the underlying native shared object.
  const player = useVideoPlayer(src, (instance) => {
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
