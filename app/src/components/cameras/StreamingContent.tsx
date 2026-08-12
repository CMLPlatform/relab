import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { StatusPill } from '@/components/base/StatusPill';
import type { StreamSession } from '@/context/streamSession';
import { useStreamSession } from '@/context/streamSession';
import { useStopYouTubeStreamMutation } from '@/features/cameras/rpi/hooks';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useElapsed } from '@/hooks/useElapsed';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';
import { LivePreview } from './LivePreview';
import { showStreamStopFailed } from './streamingFeedback';

// react-native-css drops font-variant-numeric, so `tabular-nums` compiles to nothing.
const tabularNums = { fontVariant: ['tabular-nums' as const] };

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
  const router = useRouter();
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();
  const elapsed = useElapsed(session.startedAt);
  const stopMutation = useStopYouTubeStreamMutation(session.cameraId, session.productId);

  const handleWatch = useCallback(
    async () => openExternalUrl(session.youtubeUrl),
    [session.youtubeUrl],
  );

  const handleStop = useCallback(() => {
    stopMutation.mutate(undefined, {
      onSuccess: () => {
        setActiveStream(null);
        onStop?.();
      },
      onError: (err) => showStreamStopFailed(feedback, err),
    });
  }, [stopMutation, setActiveStream, onStop, feedback]);

  const handleGoToProduct = useCallback(() => {
    router.push({ pathname: '/products/[id]', params: { id: String(session.productId) } });
    onStop?.();
  }, [router, session.productId, onStop]);

  return (
    <View className="gap-1">
      {/* Header: LIVE badge + elapsed */}
      <View className="flex-row items-center gap-2 px-4 py-1">
        <StatusPill label="LIVE" tone="live" />
        <AppText variant="body" className="flex-1 opacity-60" style={tabularNums}>
          {elapsed}
        </AppText>
      </View>

      {/* Live camera preview (compact) */}
      <View className="w-full max-w-[480px] self-center">
        <LivePreview camera={{ id: session.cameraId }} />
      </View>

      {/* Actions */}
      <View className="flex-row gap-2 px-4 pt-1">
        <AppButton variant="outline" onPress={handleWatch} className="flex-1">
          <Icon name="external-link" size={16} color={theme.colors.onSurface} />
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
          <Icon name="chevron-right" size={16} color={theme.colors.onSurface} />
        </AppButton>
      ) : null}
    </View>
  );
}
