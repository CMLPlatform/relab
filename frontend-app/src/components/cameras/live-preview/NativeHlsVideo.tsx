import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { View } from 'react-native';
import { livePreviewStyles as styles } from './shared';

export function NativeHlsVideo({ src }: { src: string }) {
  const player = useVideoPlayer(src, (instance) => {
    instance.muted = true;
    instance.loop = false;
    instance.play();
  });

  useEffect(() => {
    return () => {
      player.release?.();
    };
  }, [player]);

  return (
    <View style={styles.videoFrame}>
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#000' }}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}
