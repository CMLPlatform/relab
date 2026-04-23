import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Button, Card, Chip, Text } from 'react-native-paper';
import { MutedText } from '@/components/base/MutedText';
import type { StreamView } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';

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

  return (
    <Card
      style={{
        borderRadius: 12,
        ...(isLive && { borderLeftWidth: 3, borderLeftColor: theme.tokens.status.live }),
      }}
    >
      <Card.Content style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons
            name="youtube"
            size={20}
            color={isLive ? theme.tokens.status.live : theme.colors.onSurfaceVariant}
          />
          <Text variant="titleSmall" style={{ flex: 1 }}>
            YouTube Live
          </Text>
          {isLive ? (
            <Chip
              compact
              style={{ backgroundColor: theme.tokens.status.live }}
              textStyle={{ color: theme.colors.onError, fontSize: 11, fontWeight: '700' }}
            >
              LIVE
            </Chip>
          ) : null}
        </View>

        {isLoading && !streamStatus ? (
          <MutedText style={{ opacity: 0.5 }}>Checking stream status…</MutedText>
        ) : isLive && streamStatus ? (
          <>
            {elapsed ? <MutedText style={{ opacity: 0.6 }}>Live for {elapsed}</MutedText> : null}
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.primary }}
              onPress={onWatch}
              numberOfLines={1}
            >
              {streamStatus.url}
            </Text>
            <Button
              mode="outlined"
              compact
              textColor={theme.colors.error}
              onPress={onStop}
              loading={isStopping}
              disabled={isStopping}
              style={{ alignSelf: 'flex-start', marginTop: 4 }}
            >
              Stop stream
            </Button>
          </>
        ) : (
          <MutedText style={{ opacity: 0.5 }}>
            Not streaming — start a live stream from a product page.
          </MutedText>
        )}
      </Card.Content>
    </Card>
  );
}
