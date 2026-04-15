import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, Card, Chip, Text, useTheme } from 'react-native-paper';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useStopYouTubeStreamMutation, useStreamStatusQuery } from '@/hooks/useRpiCameras';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';

interface YouTubeStreamCardProps {
  cameraId: string;
  isOnline: boolean;
}

function useElapsedTime(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const mins = Math.floor(s / 60);
      const secs = String(s % 60).padStart(2, '0');
      setElapsed(`${mins}:${secs}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

export function YouTubeStreamCard({ cameraId, isOnline }: YouTubeStreamCardProps) {
  const theme = useTheme();
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();

  const { data: streamStatus, isLoading: statusLoading } = useStreamStatusQuery(cameraId, {
    enabled: isOnline && youtubeEnabled,
  });

  const stopMutation = useStopYouTubeStreamMutation(cameraId);
  const elapsed = useElapsedTime(streamStatus?.started_at ?? null);

  if (!youtubeEnabled) return null;

  const isLive = !!streamStatus;

  const handleStop = () => {
    feedback.alert({
      title: 'End live stream?',
      message: 'This will stop the broadcast and save the recording.',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'End Stream',
          onPress: () =>
            stopMutation.mutate(undefined, {
              onSuccess: () => setActiveStream(null),
              onError: (err) =>
                feedback.alert({
                  title: 'Stop failed',
                  message: `Failed to stop stream: ${String(err)}`,
                  buttons: [{ text: 'OK' }],
                }),
            }),
        },
      ],
    });
  };

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
          {isLive && (
            <Chip
              compact
              style={{ backgroundColor: '#e53935' }}
              textStyle={{ color: '#fff', fontSize: 11, fontWeight: '700' }}
            >
              LIVE
            </Chip>
          )}
        </View>

        {statusLoading && !streamStatus ? (
          <Text variant="bodySmall" style={{ opacity: 0.5 }}>
            Checking stream status…
          </Text>
        ) : isLive ? (
          <>
            {elapsed ? (
              <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                Live for {elapsed}
              </Text>
            ) : null}
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.primary }}
              onPress={() => void Linking.openURL(streamStatus.url)}
              numberOfLines={1}
            >
              {streamStatus.url}
            </Text>
            <Button
              mode="outlined"
              compact
              textColor={theme.colors.error}
              onPress={handleStop}
              loading={stopMutation.isPending}
              disabled={stopMutation.isPending}
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
