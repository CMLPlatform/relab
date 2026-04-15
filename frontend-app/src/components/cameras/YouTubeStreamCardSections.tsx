import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Button, Card, Chip, Text, useTheme } from 'react-native-paper';
import type { StreamView } from '@/services/api/rpiCamera';

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
  const theme = useTheme();

  return (
    <Card
      style={{
        borderRadius: 12,
        ...(isLive && { borderLeftWidth: 3, borderLeftColor: '#e53935' }),
      }}
    >
      <Card.Content style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons
            name="youtube"
            size={20}
            color={isLive ? '#e53935' : theme.colors.onSurfaceVariant}
          />
          <Text variant="titleSmall" style={{ flex: 1 }}>
            YouTube Live
          </Text>
          {isLive ? (
            <Chip
              compact
              style={{ backgroundColor: '#e53935' }}
              textStyle={{ color: '#fff', fontSize: 11, fontWeight: '700' }}
            >
              LIVE
            </Chip>
          ) : null}
        </View>

        {isLoading && !streamStatus ? (
          <Text variant="bodySmall" style={{ opacity: 0.5 }}>
            Checking stream status…
          </Text>
        ) : isLive && streamStatus ? (
          <>
            {elapsed ? (
              <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                Live for {elapsed}
              </Text>
            ) : null}
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
          <Text variant="bodySmall" style={{ opacity: 0.5 }}>
            Not streaming — start a live stream from a product page.
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}
