import { Platform } from 'react-native';
import { NativeHlsVideo } from './NativeHlsVideo';
import { WebHlsVideo } from './WebHlsVideo';

export function PreviewPlayer({ src, isLocalStream }: { src: string; isLocalStream: boolean }) {
  if (Platform.OS === 'web') {
    return <WebHlsVideo src={src} withCredentials={!isLocalStream} />;
  }

  return <NativeHlsVideo src={src} />;
}
