import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, IconButton, Text } from 'react-native-paper';
import { LivePreview } from '@/components/cameras/LivePreview';
import type { CameraConnectionInfo } from '@/hooks/useLocalConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import {
  type EffectiveConnection,
  STATUS_COLOR,
  STATUS_LABEL,
  cameraDetailStyles as styles,
} from './styles';

type CameraConnectionCardProps = {
  camera: CameraReadWithStatus;
  effectiveConnection: EffectiveConnection;
  isFetching: boolean;
  onRefresh: () => void;
  onOpenManualSetup: () => void;
  onDisconnectLocal: () => void;
};

export function CameraConnectionCard({
  camera,
  effectiveConnection,
  isFetching,
  onRefresh,
  onOpenManualSetup,
  onDisconnectLocal,
}: CameraConnectionCardProps) {
  const { localConnection, relayStatus } = effectiveConnection;
  const isOnline = relayStatus === 'online';
  const statusColor = camera.status ? STATUS_COLOR[camera.status.connection] : STATUS_COLOR.offline;
  const statusLabel = camera.status ? STATUS_LABEL[camera.status.connection] : STATUS_LABEL.offline;

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.connectionContent}>
        <View style={styles.statusRow}>
          {localConnection.mode === 'probing' ? (
            <>
              <ActivityIndicator size={14} style={styles.inlineSpinner} />
              <Text variant="titleSmall" style={styles.statusTextMuted}>
                {isOnline ? 'Searching for direct connection…' : 'Checking connection…'}
              </Text>
            </>
          ) : localConnection.mode === 'local' ? (
            <>
              <MaterialCommunityIcons
                name="ethernet"
                size={18}
                color="#2e7d32"
                style={styles.inlineIcon}
              />
              <Text variant="titleSmall" style={styles.statusTextLocal}>
                Connected - Direct · &lt;1 s
              </Text>
            </>
          ) : isOnline ? (
            <>
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }, styles.inlineDot]}
              />
              <Text variant="titleSmall" style={[styles.statusText, { color: statusColor }]}>
                Connected - Remote · ~2 s
              </Text>
            </>
          ) : (
            <>
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }, styles.inlineDot]}
              />
              <Text variant="titleSmall" style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </>
          )}

          <IconButton
            icon="refresh"
            size={18}
            loading={isFetching}
            onPress={onRefresh}
            accessibilityLabel="Refresh status"
            style={styles.iconButton}
          />

          {localConnection.mode === 'local' ? (
            <Button compact mode="text" onPress={onDisconnectLocal}>
              Disconnect
            </Button>
          ) : null}

          {localConnection.mode === 'relay' ? (
            <Button compact mode="text" onPress={onOpenManualSetup}>
              Manual setup…
            </Button>
          ) : null}
        </View>

        <Text variant="bodySmall" style={styles.connectionHint}>
          {localConnection.mode === 'local'
            ? `Via Ethernet · ${localConnection.localBaseUrl ?? ''}`
            : localConnection.mode === 'probing' && isOnline
              ? 'Camera online - checking local network for a faster direct connection'
              : isOnline
                ? 'Via WebSocket relay - connect Ethernet for ~0.4 s latency instead of ~2 s'
                : camera.status?.connection === 'offline'
                  ? 'Waiting for camera to connect via WebSocket relay'
                  : statusLabel}
        </Text>
      </Card.Content>
    </Card>
  );
}

type CameraPreviewSectionProps = {
  camera: CameraReadWithStatus;
  canPreview: boolean;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  connectionInfo: CameraConnectionInfo;
};

export function CameraPreviewSection({
  camera,
  canPreview,
  previewEnabled,
  onTogglePreview,
  connectionInfo,
}: CameraPreviewSectionProps) {
  if (!canPreview) return null;

  return (
    <>
      <Card style={styles.card}>
        <Card.Content style={styles.previewControlContent}>
          <View style={styles.previewCopy}>
            <Text variant="titleMedium">Camera Preview</Text>
            <Text variant="bodySmall" style={styles.connectionHint}>
              {previewEnabled
                ? 'Preview is running. Stop it when you no longer need the live feed.'
                : 'Load the live feed when you want to check framing or focus.'}
            </Text>
          </View>
          <Button mode={previewEnabled ? 'outlined' : 'contained'} onPress={onTogglePreview}>
            {previewEnabled ? 'Stop Preview' : 'Load Preview'}
          </Button>
        </Card.Content>
      </Card>
      {previewEnabled ? <LivePreview camera={camera} connectionInfo={connectionInfo} /> : null}
    </>
  );
}
