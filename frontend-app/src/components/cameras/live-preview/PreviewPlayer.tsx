import { Platform } from 'react-native';
import { NativeHlsVideo } from '@/components/cameras/live-preview/NativeHlsVideo';
import { WebHlsVideo } from '@/components/cameras/live-preview/WebHlsVideo';

export function getLivePreviewCaption(isLocalStream: boolean): string {
  return isLocalStream ? 'Live preview · Direct · <1s' : 'Live preview · LL-HLS';
}

export function PreviewPlayer({ src, isLocalStream }: { src: string; isLocalStream: boolean }) {
  if (Platform.OS === 'web') {
    return <WebHlsVideo src={src} withCredentials={!isLocalStream} />;
  }

  return <NativeHlsVideo src={src} />;
}
