import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import { MutedText } from '@/components/base/MutedText';
import { StatusPill } from '@/components/base/StatusPill';
import type { StreamView } from '@/services/api/rpiCamera';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

const createThemedStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    liveCard: {
      borderLeftWidth: 3,
      borderLeftColor: theme.tokens.status.live,
    },
    watchLink: { color: theme.colors.primary },
  });
});

type YouTubeStreamCardViewProps = {
  isLive: boolean;
  isLoading: boolean;
  elapsed: string;
  streamStatus: StreamView | null | undefined;
  isStopping: boolean;
  onWatch: () => void;
  onStop: () => void;
};

export function YouTubeStreamCardView({
  isLive,
  isLoading,
  elapsed,
  streamStatus,
  isStopping,
  onWatch,
  onStop,
}: YouTubeStreamCardViewProps) {
  const theme = useAppTheme();
  const themed = createThemedStyles(theme);

  return (
    <Card style={isLive ? themed.liveCard : undefined}>
      <View className="gap-2 p-3">
        <View className="flex-row items-center gap-2">
          <Icon
            name="youtube"
            size="md"
            color={isLive ? theme.tokens.status.live : theme.colors.onSurfaceVariant}
          />
          <AppText variant="title" className="flex-1">
            YouTube Live
          </AppText>
          {isLive ? <StatusPill label="LIVE" tone="live" /> : null}
        </View>

        {isLoading && !streamStatus ? (
          <MutedText>Checking stream status…</MutedText>
        ) : isLive && streamStatus ? (
          <>
            {elapsed ? <MutedText>Live for {elapsed}</MutedText> : null}
            <AppText variant="body" style={themed.watchLink} onPress={onWatch} numberOfLines={1}>
              {streamStatus.url}
            </AppText>
            <AppButton
              variant="outline"
              onPress={onStop}
              loading={isStopping}
              disabled={isStopping}
              className="self-start mt-1"
            >
              <AppText style={{ color: theme.colors.error }}>Stop stream</AppText>
            </AppButton>
          </>
        ) : (
          <MutedText>Not streaming — start a live stream from a product page.</MutedText>
        )}
      </View>
    </Card>
  );
}
