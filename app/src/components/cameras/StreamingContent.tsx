import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { StatusPill } from '@/components/base/StatusPill';
import type { StreamSession } from '@/context/streamSession';
import { useStreamSession } from '@/context/streamSession';
import { useStopYouTubeStreamMutation } from '@/features/cameras/rpi/hooks';
import { invalidateProductQuery } from '@/features/products/queries';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useElapsed } from '@/hooks/useElapsed';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';
import { LivePreview } from './LivePreview';
import { showStreamStopFailed } from './streamingFeedback';

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
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();
  const elapsed = useElapsed(session.startedAt);
  const stopMutation = useStopYouTubeStreamMutation(session.cameraId);

  const handleWatch = useCallback(
    async () => openExternalUrl(session.youtubeUrl),
    [session.youtubeUrl],
  );

  const handleStop = useCallback(() => {
    stopMutation.mutate(undefined, {
      onSuccess: () => {
        setActiveStream(null);
        invalidateProductQuery(queryClient, session.productId);
        onStop?.();
      },
      onError: (err) => showStreamStopFailed(feedback, err),
    });
  }, [stopMutation, setActiveStream, queryClient, session.productId, onStop, feedback]);

  const handleGoToProduct = useCallback(() => {
    router.push({ pathname: '/products/[id]', params: { id: String(session.productId) } });
    onStop?.();
  }, [router, session.productId, onStop]);

  return (
    <View style={styles.root}>
      {/* Header: LIVE badge + elapsed */}
      <View style={styles.header}>
        <StatusPill label="LIVE" tone="live" />
        <AppText variant="body" style={styles.elapsed}>
          {elapsed}
        </AppText>
      </View>

      {/* Live camera preview (compact) */}
      <View style={styles.previewContainer}>
        <LivePreview camera={{ id: session.cameraId }} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <AppButton variant="outline" onPress={handleWatch} className="flex-1">
          <MaterialCommunityIcons name="open-in-new" size={16} color={theme.colors.onSurface} />
          <AppText style={{ color: theme.colors.onSurface }}>Watch on YouTube</AppText>
        </AppButton>
        <AppButton
          variant="destructive"
          onPress={handleStop}
          loading={stopMutation.isPending}
          disabled={stopMutation.isPending}
          className="flex-1"
        >
          Stop stream
        </AppButton>
      </View>

      {/* Product link (sheet mode only) */}
      {showProductLink ? (
        <AppButton variant="ghost" onPress={handleGoToProduct} className="self-start ml-2 mt-0.5">
          <AppText style={{ color: theme.colors.onSurface }}>Go to {session.productName}</AppText>
          <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.onSurface} />
        </AppButton>
      ) : null}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>) {
  return StyleSheet.create({
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
  });
}
