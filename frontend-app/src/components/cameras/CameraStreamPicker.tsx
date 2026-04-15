import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { addProductVideo } from '@/services/api/products';
import type { CameraReadWithStatus, YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { startYouTubeStream } from '@/services/api/rpiCamera';
import { CameraPickerDialog } from './CameraPickerDialog';

interface CameraStreamPickerProps {
  productId: number;
  productName: string;
  visible: boolean;
  onDismiss: () => void;
}

type ConfigState = {
  camera: CameraReadWithStatus;
  title: string;
  privacy: YouTubePrivacyStatus;
};

/**
 * Two-step stream starter:
 *   1. Camera picker dialog (shared with capture flow)
 *   2. Stream config dialog (title + privacy)
 *
 * Handles startYouTubeStream, setActiveStream, and addProductVideo internally.
 */
export function CameraStreamPicker({
  productId,
  productName,
  visible,
  onDismiss,
}: CameraStreamPickerProps) {
  const { setActiveStream } = useStreamSession();
  const feedback = useAppFeedback();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleCameraSelect = (camera: CameraReadWithStatus) => {
    setConfig({ camera, title: productName, privacy: 'private' });
  };

  const handleClose = () => {
    setConfig(null);
    onDismiss();
  };

  const handleStartStream = async () => {
    if (!config) return;
    setIsStarting(true);
    try {
      const result = await startYouTubeStream(config.camera.id, {
        product_id: productId,
        title: config.title.trim() || undefined,
        privacy_status: config.privacy,
      });
      setActiveStream({
        cameraId: config.camera.id,
        cameraName: config.camera.name,
        productId,
        productName,
        startedAt: result.started_at,
        youtubeUrl: result.url,
      });
      // Best-effort: attach the YouTube URL to the product's video list.
      addProductVideo(productId, {
        url: result.url,
        title: config.title.trim() || 'Live stream',
        description: '',
      }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['product', productId] });
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GOOGLE_OAUTH_REQUIRED') {
        feedback.alert({
          title: 'Google account required',
          message: 'Connect your Google account in Profile > Linked Accounts to stream to YouTube.',
          buttons: [{ text: 'OK' }],
        });
      } else {
        feedback.alert({
          title: 'Stream start failed',
          message: `Failed to start stream: ${msg}`,
          buttons: [{ text: 'OK' }],
        });
      }
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <>
      <CameraPickerDialog
        visible={visible && config === null}
        onDismiss={onDismiss}
        onSelect={handleCameraSelect}
        title="Select camera to stream"
      />

      <Portal>
        <Dialog visible={config !== null} onDismiss={() => setConfig(null)}>
          <Dialog.Title>Go Live on {config?.camera.name}</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <TextInput
              mode="outlined"
              label="Stream title (optional)"
              value={config?.title ?? ''}
              onChangeText={(v) => setConfig((c) => (c ? { ...c, title: v } : c))}
              maxLength={100}
            />
            <Text variant="labelMedium" style={{ marginTop: 4 }}>
              Visibility
            </Text>
            <SegmentedButtons
              value={config?.privacy ?? 'private'}
              onValueChange={(v) =>
                setConfig((c) => (c ? { ...c, privacy: v as YouTubePrivacyStatus } : c))
              }
              buttons={[
                { value: 'private', label: 'Private', icon: 'lock' },
                { value: 'unlisted', label: 'Unlisted', icon: 'eye-off' },
                { value: 'public', label: 'Public', icon: 'earth' },
              ]}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfig(null)} disabled={isStarting}>
              Back
            </Button>
            <View style={{ flex: 1 }} />
            <Button
              onPress={() => void handleStartStream()}
              loading={isStarting}
              disabled={isStarting}
            >
              Go Live
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
