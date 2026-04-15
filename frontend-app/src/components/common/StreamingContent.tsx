import { Image } from 'expo-image';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Chip, Icon, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import type { StreamSession } from '@/context/StreamSessionContext';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useElapsed } from '@/hooks/useElapsed';
import { useStopYouTubeStreamMutation } from '@/hooks/useRpiCameras';

interface StreamingContentProps {
  session: StreamSession;
  /** Called after a successful stop or after navigating to the product page. */
  onStop?: () => void;
  /** When true, renders a "Go to [product]" navigation link at the bottom. */
  showProductLink?: boolean;
}

function getYouTubeVideoId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
}

export function StreamingContent({
  session,
  onStop,
  showProductLink = false,
}: StreamingContentProps) {
  const theme = useTheme();
  const router = useRouter();
  const { setActiveStream } = useStreamSession();
  const elapsed = useElapsed(session.startedAt);
  const stopMutation = useStopYouTubeStreamMutation(session.cameraId);

  const videoId = getYouTubeVideoId(session.youtubeUrl);
  const thumbnailUri = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;

  const handleWatch = () => void Linking.openURL(session.youtubeUrl);

  const handleStop = () => {
    stopMutation.mutate(undefined, {
      onSuccess: () => {
        setActiveStream(null);
        onStop?.();
      },
      onError: (err) => alert(`Failed to stop stream: ${String(err)}`),
    });
  };

  const handleGoToProduct = () => {
    router.push({ pathname: '/products/[id]', params: { id: String(session.productId) } });
    onStop?.();
  };

  return (
    <View style={styles.root}>
      {/* Header: LIVE chip + elapsed */}
      <View style={styles.header}>
        <View style={styles.youtubeIcon}>
          <Icon source="youtube" size={20} color="#e53935" />
        </View>
        <Chip
          compact
          style={styles.liveChip}
          textStyle={styles.liveChipText}
        >
          LIVE
        </Chip>
        <Text style={styles.elapsed} variant="bodySmall">
          {elapsed}
        </Text>
      </View>

      {/* Thumbnail */}
      {thumbnailUri && (
        <Button
          onPress={handleWatch}
          contentStyle={styles.thumbnailButton}
          style={styles.thumbnailWrapper}
          mode="text"
        >
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.thumbnail}
            contentFit="cover"
            accessibilityLabel="YouTube live thumbnail"
          />
        </Button>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          mode="outlined"
          onPress={handleWatch}
          style={styles.actionBtn}
          icon="youtube"
        >
          Watch
        </Button>
        <Button
          mode="outlined"
          onPress={handleStop}
          loading={stopMutation.isPending}
          disabled={stopMutation.isPending}
          textColor={theme.colors.error}
          style={[styles.actionBtn, { borderColor: theme.colors.error }]}
        >
          Stop stream
        </Button>
      </View>

      {/* Product link (sheet mode only) */}
      {showProductLink && (
        <Button
          mode="text"
          onPress={handleGoToProduct}
          icon="chevron-right"
          contentStyle={styles.productLinkContent}
          style={styles.productLink}
        >
          Go to {session.productName}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  youtubeIcon: {
    marginRight: 2,
  },
  liveChip: {
    backgroundColor: '#e53935',
    height: 24,
  },
  liveChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  elapsed: {
    flex: 1,
    opacity: 0.6,
    fontVariant: ['tabular-nums'],
  },
  thumbnailWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    padding: 0,
  },
  thumbnailButton: {
    padding: 0,
    margin: 0,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  productLink: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  productLinkContent: {
    flexDirection: 'row-reverse',
  },
});
