import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Text } from 'react-native-paper';
import { MutedText } from '@/components/base/MutedText';
import type { StreamView } from '@/services/api/rpiCamera';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';

const styles = StyleSheet.create({
  card: { borderRadius: 12 },
  content: { gap: 8 },
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
    liveChip: { backgroundColor: theme.tokens.status.live },
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
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="youtube"
            size={20}
            color={isLive ? theme.tokens.status.live : theme.colors.onSurfaceVariant}
          />
          <Text variant="titleSmall" style={styles.headerTitle}>
            YouTube Live
          </Text>
          {isLive ? (
            <Chip compact style={themed.liveChip} textStyle={themed.liveChipText}>
              LIVE
            </Chip>
          ) : null}
        </View>

        {isLoading && !streamStatus ? (
          <MutedText style={styles.statusText}>Checking stream status…</MutedText>
        ) : isLive && streamStatus ? (
          <>
            {elapsed ? <MutedText style={styles.elapsedText}>Live for {elapsed}</MutedText> : null}
            <Text variant="bodySmall" style={themed.watchLink} onPress={onWatch} numberOfLines={1}>
              {streamStatus.url}
            </Text>
            <Button
              mode="outlined"
              compact
              textColor={theme.colors.error}
              onPress={onStop}
              loading={isStopping}
              disabled={isStopping}
              style={styles.stopButton}
            >
              Stop stream
            </Button>
          </>
        ) : (
          <MutedText style={styles.statusText}>
            Not streaming — start a live stream from a product page.
          </MutedText>
        )}
      </Card.Content>
    </Card>
  );
}
