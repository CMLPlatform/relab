import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Chip, Text, useTheme } from 'react-native-paper';
import { LivePreview } from '@/components/cameras/LivePreview';
import { showStreamStopFailed } from '@/components/cameras/streamingFeedback';
import type { StreamSession } from '@/context/StreamSessionContext';
import { useStreamSession } from '@/context/StreamSessionContext';
import { invalidateProductQuery } from '@/hooks/camera-data/mutations';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useElapsed } from '@/hooks/useElapsed';
import { useStopYouTubeStreamMutation } from '@/hooks/useRpiCameras';

interface StreamingContentProps {
  session: StreamSession;
  /** Called after a successful stop or after navigating to the product page. */
  onStop?: () => void;
  /** When true, renders a "Go to [product]" navigation link at the bottom. */
  showProductLink?: boolean;
}

export function StreamingContent({
  session,
  onStop,
  showProductLink = false,
}: StreamingContentProps) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();
  const elapsed = useElapsed(session.startedAt);
  const stopMutation = useStopYouTubeStreamMutation(session.cameraId);

  const handleWatch = () => void Linking.openURL(session.youtubeUrl);

  const handleStop = () => {
    stopMutation.mutate(undefined, {
      onSuccess: () => {
        setActiveStream(null);
        invalidateProductQuery(queryClient, session.productId);
        onStop?.();
      },
      onError: (err) => showStreamStopFailed(feedback, err),
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
        <Chip compact style={styles.liveChip} textStyle={styles.liveChipText}>
          LIVE
        </Chip>
        <Text style={styles.elapsed} variant="bodySmall">
          {elapsed}
        </Text>
      </View>

      {/* Live camera preview (compact) */}
      <View style={styles.previewContainer}>
        <LivePreview camera={{ id: session.cameraId }} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button mode="outlined" onPress={handleWatch} style={styles.actionBtn} icon="open-in-new">
          Watch on YouTube
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
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
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
  previewContainer: {
    maxWidth: 480,
    alignSelf: 'center' as const,
    width: '100%',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
  productLink: {
    alignSelf: 'flex-start',
    marginLeft: 8,
    marginTop: 2,
  },
  productLinkContent: {
    flexDirection: 'row-reverse',
  },
});
