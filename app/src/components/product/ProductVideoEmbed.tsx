import { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { extractYouTubeVideoId } from '@/services/api/validation/productSchema';
import { openExternalUrl } from '@/services/externalLinks';

const embedContainerStyle = {
  maxWidth: 480,
  aspectRatio: 16 / 9,
  width: '100%' as const,
  alignSelf: 'center' as const,
  marginHorizontal: 14,
  marginVertical: 8,
  borderRadius: 8,
  overflow: 'hidden' as const,
};

export function VideoEmbed({ url, linkColor }: { url: string; linkColor: string }) {
  const [loaded, setLoaded] = useState(false);
  const videoId = extractYouTubeVideoId(url);
  const handleOpenUrl = async () => openExternalUrl(url);
  if (!videoId) {
    return (
      <TouchableOpacity onPress={handleOpenUrl}>
        <Text style={[styles.videoLink, { color: linkColor }]}>{url}</Text>
      </TouchableOpacity>
    );
  }
  const embedUri = `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (!loaded) {
    return (
      <View style={styles.videoActions}>
        <TouchableOpacity onPress={() => setLoaded(true)}>
          <Text style={[styles.videoLink, { color: linkColor }]}>Load video</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleOpenUrl}>
          <Text style={[styles.videoLink, { color: linkColor }]}>Open video</Text>
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
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
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
  videoActions: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 4,
  },
  videoLink: {
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 26,
    textDecorationLine: 'underline',
  },
  webEmbed: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
    borderRadius: 8,
  },
});
