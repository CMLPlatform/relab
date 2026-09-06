import { isWeb } from '@/services/storage';
import { NativeHlsVideo } from './NativeHlsVideo';
import { WebHlsVideo } from './WebHlsVideo';

export function PreviewPlayer({ src, isLocalStream }: { src: string; isLocalStream: boolean }) {
  if (isWeb()) {
    return <WebHlsVideo src={src} withCredentials={!isLocalStream} />;
  }

  // Relayed streams need the bearer token; a local stream must not be sent backend credentials.
  return <NativeHlsVideo src={src} authenticated={!isLocalStream} />;
}
