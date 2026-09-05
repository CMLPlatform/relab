import { isWeb } from '@/services/storage';
import { NativeHlsVideo } from './NativeHlsVideo';
import { WebHlsVideo } from './WebHlsVideo';

export function PreviewPlayer({ src, isLocalStream }: { src: string; isLocalStream: boolean }) {
  if (isWeb()) {
    return <WebHlsVideo src={src} withCredentials={!isLocalStream} />;
  }

  // Relayed streams are proxied by the owner-checked backend route and need the
  // bearer token; a local stream goes straight to the Pi on the LAN and must not
  // be sent backend credentials.
  return <NativeHlsVideo src={src} authenticated={!isLocalStream} />;
}
