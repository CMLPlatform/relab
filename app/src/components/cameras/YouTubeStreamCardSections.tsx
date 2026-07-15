import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { MutedText } from '@/components/base/MutedText';
import type { StreamView } from '@/services/api/rpiCamera';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

const styles = StyleSheet.create({
  card: { borderRadius: 12 },
  content: { padding: 12, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { flex: 1 },
  statusText: { opacity: 0.5 },
  elapsedText: { opacity: 0.6 },
  stopButton: { alignSelf: 'flex-start', marginTop: 4 },
});

const createThemedStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    liveCard: {
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: theme.tokens.status.live,
    },
    liveChip: {
      backgroundColor: theme.tokens.status.live,
      height: 22,
      justifyContent: 'center',
      paddingHorizontal: 8,
      borderRadius: 11,
    },
    liveChipText: { color: theme.colors.onError, fontSize: 11, fontWeight: '700' },
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
    <Card style={isLive ? themed.liveCard : styles.card}>
      <View style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="youtube"
            size={20}
            color={isLive ? theme.tokens.status.live : theme.colors.onSurfaceVariant}
          />
          <AppText variant="title" style={styles.headerTitle}>
            YouTube Live
          </AppText>
          {isLive ? (
            <View style={themed.liveChip}>
              <AppText style={themed.liveChipText}>LIVE</AppText>
            </View>
          ) : null}
        </View>

        {isLoading && !streamStatus ? (
          <MutedText style={styles.statusText}>Checking stream status…</MutedText>
        ) : isLive && streamStatus ? (
          <>
            {elapsed ? <MutedText style={styles.elapsedText}>Live for {elapsed}</MutedText> : null}
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
          <MutedText style={styles.statusText}>
            Not streaming — start a live stream from a product page.
          </MutedText>
        )}
      </View>
    </Card>
  );
}
