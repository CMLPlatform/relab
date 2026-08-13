import { useCallback, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { radius } from '@/constants';
import { extractYouTubeVideoId } from '@/services/api/validation/productSchema';
import { openExternalUrl } from '@/services/externalLinks';

const embedContainerStyle = {
  maxWidth: 480,
  aspectRatio: 16 / 9,
  width: '100%' as const,
  alignSelf: 'center' as const,
  marginHorizontal: 14,
  marginVertical: 8,
  borderRadius: radius.card,
  overflow: 'hidden' as const,
};

export function VideoEmbed({ url, linkColor }: { url: string; linkColor: string }) {
  const [loaded, setLoaded] = useState(false);
  const videoId = extractYouTubeVideoId(url);
  const handleOpenUrl = useCallback(async () => openExternalUrl(url), [url]);
  const handleLoad = useCallback(() => setLoaded(true), []);
  if (!videoId) {
    return (
      <TouchableOpacity onPress={handleOpenUrl}>
        <AppText className="px-3.5 underline" style={{ color: linkColor }}>
          {url}
        </AppText>
      </TouchableOpacity>
    );
  }
  const embedUri = `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (!loaded) {
    return (
      <View className="flex-row gap-4 my-1">
        <TouchableOpacity onPress={handleLoad}>
          <AppText className="px-3.5 underline" style={{ color: linkColor }}>
            Load video
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleOpenUrl}>
          <AppText className="px-3.5 underline" style={{ color: linkColor }}>
            Open video
          </AppText>
        </TouchableOpacity>
      </View>
    );
  }
  if (Platform.OS === 'web') {
    return (
      <View style={embedContainerStyle}>
        <iframe
          src={embedUri}
          title="Embedded product video"
          style={styles.webEmbed}
          // allow-popups (not allow-popups-to-escape-sandbox): the "Watch on
          // YouTube" fullscreen/share affordance opens via window.open, which
          // only needs the popup itself allowed, not for it to escape this
          // frame's sandbox restrictions.
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerPolicy="no-referrer"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </View>
    );
  }
  const { WebView } = require('react-native-webview');
  return (
    <WebView
      originWhitelist={['https://www.youtube-nocookie.com']}
      source={{ uri: embedUri }}
      style={embedContainerStyle}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
    />
  );
}

const styles = StyleSheet.create({
  // Raw web <iframe>, not a react-native-css-managed element — stays
  // style-driven.
  webEmbed: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
    borderRadius: radius.card,
  },
});
